import { describe, expect, test } from "bun:test"

import { createWorkspaceQueryBootstrap, parseWorkspaceQuery } from "@/features/workspace/query-bootstrap"

describe("parseWorkspaceQuery", () => {
  test("reads one command and ordered, repeatable remote files", () => {
    const result = parseWorkspaceQuery(
      "?command=ffmpeg+-i+input.mp4+output.webm&file=https%3A%2F%2Fmedia.example%2Finput.mp4&file=https%3A%2F%2Fmedia.example%2Faudio.wav",
    )

    expect(result.command).toBe("ffmpeg -i input.mp4 output.webm")
    expect(result.remoteUrls.map((url) => url.href)).toEqual([
      "https://media.example/input.mp4",
      "https://media.example/audio.wav",
    ])
  })

  test("ignores malformed, relative, credentialed, duplicate, and non-HTTPS URLs", () => {
    const params = new URLSearchParams()
    for (const value of [
      "not a url",
      "/local.mp4",
      "http://example.com/insecure.mp4",
      "file:///tmp/input.mp4",
      "https://user:secret@example.com/private.mp4",
      "https://example.com/input.mp4#first",
      "https://example.com/input.mp4#second",
    ]) {
      params.append("file", value)
    }

    expect(parseWorkspaceQuery(`?${params}`).remoteUrls.map((url) => url.href)).toEqual([
      "https://example.com/input.mp4",
    ])
  })

  test("caps remote imports and rejects a command beyond the shell limit", () => {
    const params = new URLSearchParams({ command: "x".repeat(20_001) })
    for (let index = 0; index < 12; index += 1) params.append("file", `https://example.com/${index}.mp4`)

    const result = parseWorkspaceQuery(`?${params}`)
    expect(result.command).toBe("")
    expect(result.remoteUrls).toHaveLength(8)
  })
})

describe("workspace query bootstrap", () => {
  test("imports files once when a mounting effect is replayed", async () => {
    const bootstrap = createWorkspaceQueryBootstrap()
    const config = parseWorkspaceQuery("?file=https%3A%2F%2Fexample.com%2Fmy%2520clip.mp4")
    const addedBatches: File[][] = []
    let fetchCount = 0
    const requestedUrls: string[] = []
    const fetchImplementation: typeof fetch = async (input) => {
      fetchCount += 1
      requestedUrls.push(String(input))
      return new Response(new Blob(["media"], { type: "video/mp4" }), { status: 200 })
    }
    const dependencies = {
      addUploads: (files: File[]) => addedBatches.push(files),
      fetch: fetchImplementation,
    }

    const firstRun = bootstrap.run(config, dependencies)
    const replayedRun = bootstrap.run(config, dependencies)

    expect(replayedRun).toBe(firstRun)
    await expect(firstRun).resolves.toEqual({ addedFiles: 1, failedUrls: [] })
    expect(fetchCount).toBe(1)
    expect(requestedUrls).toEqual(["/api/remote-file?url=https%3A%2F%2Fexample.com%2Fmy%2520clip.mp4"])
    expect(addedBatches).toHaveLength(1)
    expect(addedBatches[0]?.[0]?.name).toBe("my clip.mp4")
    expect(addedBatches[0]?.[0]?.type).toBe("video/mp4")
  })

  test("keeps successful files in order and reports individual failures", async () => {
    const bootstrap = createWorkspaceQueryBootstrap()
    const config = parseWorkspaceQuery(
      "?file=https%3A%2F%2Fexample.com%2Ffirst.mp4&file=https%3A%2F%2Fexample.com%2Fmissing.mp4&file=https%3A%2F%2Fexample.com%2Flast.wav",
    )
    const addedBatches: File[][] = []
    const errors: string[] = []
    const fetchImplementation: typeof fetch = async (input) => {
      const remoteUrl = new URL(String(input), "https://workspace.example").searchParams.get("url") ?? ""
      if (remoteUrl.endsWith("missing.mp4")) {
        return Response.json({ error: "The remote server returned 404." }, { status: 502 })
      }
      return new Response(new Blob([remoteUrl], { type: remoteUrl.endsWith(".wav") ? "audio/wav" : "video/mp4" }))
    }

    const result = await bootstrap.run(config, {
      addUploads: (files) => addedBatches.push(files),
      fetch: fetchImplementation,
      onError: (message) => errors.push(message),
    })

    expect(result.addedFiles).toBe(2)
    expect(result.failedUrls.map((url) => url.pathname)).toEqual(["/missing.mp4"])
    expect(addedBatches[0]?.map((file) => file.name)).toEqual(["first.mp4", "last.wav"])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBe("Could not add missing.mp4: The remote server returned 404.")
  })
})
