import { describe, expect, test } from "bun:test"

import { createFfmpegWorkspaceApi, installFfmpegWorkspaceApi } from "@/features/workspace/browser-api"
import type { WorkspaceAsset } from "@/features/workspace/types"

function asset(overrides: Partial<WorkspaceAsset> = {}): WorkspaceAsset {
  const blob = overrides.blob ?? new Blob(["hello"], { type: "text/plain" })
  return {
    id: "file-1",
    name: "hello.txt",
    blob,
    size: blob.size,
    type: blob.type,
    source: "output",
    status: "ready",
    progress: 100,
    objectUrl: "blob:test",
    createdAt: 1,
    ...overrides,
  }
}

describe("ffmpeg workspace browser API", () => {
  test("installs one frozen versioned API and emits one readiness event", () => {
    // SAFETY: installation only needs EventTarget methods and the optional ffmpegWorkspace property in this test.
    const target = new EventTarget() as Window
    let events = 0
    target.addEventListener("ffmpeg-workspace-api-ready", () => {
      events += 1
    })

    const first = installFfmpegWorkspaceApi(target)
    const replay = installFfmpegWorkspaceApi(target)
    expect(replay).toBe(first)
    expect(first.version).toBe(1)
    expect(Object.isFrozen(first)).toBe(true)
    expect(events).toBe(1)
  })

  test("waits for query bootstrap and deduplicates retried request IDs", async () => {
    let runs = 0
    const files = [asset()]
    const controller = createFfmpegWorkspaceApi({
      runCommand: async () => {
        runs += 1
        return { exitCode: 0, stdout: "", stderr: "", outputs: [] }
      },
      cancelCommand: () => undefined,
      isBusy: () => false,
      getFiles: () => files,
    })

    const request = { requestId: "request-1", command: "echo hello" }
    const first = controller.api.run(request)
    const replay = controller.api.run(request)
    expect(replay).toBe(first)
    expect(runs).toBe(0)

    controller.markBootstrapReady()
    controller.markBootstrapReady()
    await expect(controller.api.ready()).resolves.toMatchObject({ ready: true, bootstrap: "ready" })
    await expect(first).resolves.toMatchObject({ ok: true, value: { requestId: "request-1", exitCode: 0 } })
    expect(runs).toBe(1)
  })

  test("rejects a different request while the shared runner is busy", async () => {
    let busy = false
    let finish: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const controller = createFfmpegWorkspaceApi({
      runCommand: async () => {
        busy = true
        await pending
        busy = false
        return { exitCode: 0, stdout: "", stderr: "", outputs: [] }
      },
      cancelCommand: () => undefined,
      isBusy: () => busy,
      getFiles: () => [],
    })
    controller.markBootstrapReady()

    const first = controller.api.run({ requestId: "one", command: "echo one" })
    await Promise.resolve()
    await expect(controller.api.run({ requestId: "two", command: "echo two" })).resolves.toEqual({
      ok: false,
      error: { code: "BUSY", message: "Another workspace command is already running." },
    })
    finish?.()
    await first
  })

  test("returns metadata without private blobs and reads bounded base64 chunks", async () => {
    const file = asset({ blob: new Blob(["abcdef"], { type: "text/plain" }), size: 6 })
    const controller = createFfmpegWorkspaceApi({
      runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "", outputs: [] }),
      cancelCommand: () => undefined,
      isBusy: () => false,
      getFiles: () => [file],
    })
    controller.markBootstrapReady()

    expect(controller.api.listFiles()).toEqual([
      {
        id: "file-1",
        name: "hello.txt",
        type: file.type,
        size: 6,
        source: "output",
        status: "ready",
      },
    ])

    const first = await controller.api.readFileChunk({ fileId: "file-1", maxBytes: 4 })
    expect(first).toMatchObject({ ok: true, value: { offset: 0, nextOffset: 4, done: false } })
    if (!first.ok) throw new Error("Expected a file chunk.")
    expect(Buffer.from(first.value.base64, "base64").toString()).toBe("abcd")

    const last = await controller.api.readFileChunk({ fileId: "file-1", offset: first.value.nextOffset })
    expect(last).toMatchObject({ ok: true, value: { offset: 4, nextOffset: 6, done: true } })
    if (!last.ok) throw new Error("Expected a file chunk.")
    expect(Buffer.from(last.value.base64, "base64").toString()).toBe("ef")
  })

  test("validates commands, cancellation targets, and missing files", async () => {
    let cancelled = false
    const controller = createFfmpegWorkspaceApi({
      runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "", outputs: [] }),
      cancelCommand: () => {
        cancelled = true
      },
      isBusy: () => false,
      getFiles: () => [],
    })
    controller.markBootstrapReady()

    await expect(controller.api.run({ requestId: "", command: "" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    })
    expect(controller.api.cancel("not-active")).toEqual({ ok: true, value: { cancelled: false } })
    expect(cancelled).toBe(false)
    await expect(controller.api.readFileChunk({ fileId: "missing" })).resolves.toMatchObject({
      ok: false,
      error: { code: "FILE_NOT_FOUND" },
    })
  })
})
