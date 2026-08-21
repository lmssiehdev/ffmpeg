import { describe, expect, test } from "bun:test"

import { createWorkspaceQueryBootstrap, parseWorkspaceQuery } from "@/features/workspace/query-bootstrap"

describe("parseWorkspaceQuery", () => {
  test("reads one command and ordered, repeatable remote image URLs", () => {
    const result = parseWorkspaceQuery(
      "?command=ffmpeg+-i+input.png+output.webp&file=https%3A%2F%2Fmedia.example%2Finput.png&file=https%3A%2F%2Fmedia.example%2Foverlay.webp",
    )

    expect(result.command).toBe("ffmpeg -i input.png output.webp")
    expect(result.remoteUrls.map((url) => url.href)).toEqual([
      "https://media.example/input.png",
      "https://media.example/overlay.webp",
    ])
  })

  test("ignores malformed, relative, credentialed, duplicate, and non-HTTPS URLs", () => {
    const params = new URLSearchParams()
    for (const value of [
      "not a url",
      "/local.png",
      "http://example.com/insecure.png",
      "file:///tmp/input.png",
      "https://user:secret@example.com/private.png",
      "https://example.com/input.png#first",
      "https://example.com/input.png#second",
    ]) {
      params.append("file", value)
    }

    expect(parseWorkspaceQuery(`?${params}`).remoteUrls.map((url) => url.href)).toEqual([
      "https://example.com/input.png",
    ])
  })

  test("caps remote imports and rejects a command beyond the shell limit", () => {
    const params = new URLSearchParams({ command: "x".repeat(20_001) })
    for (let index = 0; index < 12; index += 1) params.append("file", `https://example.com/${index}.png`)

    const result = parseWorkspaceQuery(`?${params}`)
    expect(result.command).toBe("")
    expect(result.remoteUrls).toHaveLength(8)
  })
})

describe("workspace query bootstrap", () => {
  test("imports files once when a mounting effect is replayed", async () => {
    const bootstrap = createWorkspaceQueryBootstrap()
    const config = parseWorkspaceQuery("?file=https%3A%2F%2Fexample.com%2Fmy%2520image.png")
    const addedBatches: File[][] = []
    let fetchCount = 0
    const requestedUrls: string[] = []
    const fetchImplementation: typeof fetch = async (input) => {
      fetchCount += 1
      requestedUrls.push(String(input))
      return new Response(new Blob(["image"], { type: "image/png" }), { status: 200 })
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
    expect(requestedUrls).toEqual(["/api/image?url=https%3A%2F%2Fexample.com%2Fmy%2520image.png"])
    expect(addedBatches).toHaveLength(1)
    expect(addedBatches[0]?.[0]?.name).toBe("my image.png")
    expect(addedBatches[0]?.[0]?.type).toBe("image/png")
  })

  test("keeps successful files in order and reports individual failures", async () => {
    const bootstrap = createWorkspaceQueryBootstrap()
    const config = parseWorkspaceQuery(
      "?file=https%3A%2F%2Fexample.com%2Ffirst.png&file=https%3A%2F%2Fexample.com%2Fmissing.png&file=https%3A%2F%2Fexample.com%2Flast.webp",
    )
    const addedBatches: File[][] = []
    const errors: string[] = []
    const fetchImplementation: typeof fetch = async (input) => {
      const remoteUrl = new URL(String(input), "https://workspace.example").searchParams.get("url") ?? ""
      if (remoteUrl.endsWith("missing.png")) {
        return new Response(null, { status: 404 })
      }
      return new Response(new Blob([remoteUrl], { type: remoteUrl.endsWith(".webp") ? "image/webp" : "image/png" }))
    }

    const result = await bootstrap.run(config, {
      addUploads: (files) => addedBatches.push(files),
      fetch: fetchImplementation,
      onError: (message) => errors.push(message),
    })

    expect(result.addedFiles).toBe(2)
    expect(result.failedUrls.map((url) => url.pathname)).toEqual(["/missing.png"])
    expect(addedBatches[0]?.map((file) => file.name)).toEqual(["first.png", "last.webp"])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBe("Could not add missing.png: The image bridge returned HTTP 404.")
  })

  test("rejects non-image responses without falling back to a direct fetch", async () => {
    const bootstrap = createWorkspaceQueryBootstrap()
    const config = parseWorkspaceQuery("?file=https%3A%2F%2Fmedia.example.com%2Fclip.mp4")
    const addedBatches: File[][] = []
    const errors: string[] = []
    const requestedUrls: string[] = []

    const result = await bootstrap.run(config, {
      addUploads: (files) => addedBatches.push(files),
      fetch: async (input) => {
        requestedUrls.push(String(input))
        return new Response(new Blob(["video"], { type: "video/mp4" }))
      },
      onError: (message) => errors.push(message),
    })

    expect(result.addedFiles).toBe(0)
    expect(result.failedUrls.map((url) => url.pathname)).toEqual(["/clip.mp4"])
    expect(addedBatches).toHaveLength(0)
    expect(requestedUrls).toEqual(["/api/image?url=https%3A%2F%2Fmedia.example.com%2Fclip.mp4"])
    expect(errors).toEqual(["Could not add clip.mp4: Remote query files only support images."])
  })

  test("reports image bridge network failures without exposing the remote URL", async () => {
    const bootstrap = createWorkspaceQueryBootstrap()
    const config = parseWorkspaceQuery("?file=https%3A%2F%2Fprivate.example.com%2Fsigned.png%3Ftoken%3Dsecret")
    const errors: string[] = []

    await bootstrap.run(config, {
      addUploads: () => undefined,
      fetch: async () => {
        throw new TypeError("Failed to fetch")
      },
      onError: (message) => errors.push(message),
    })

    expect(errors).toEqual(["Could not add signed.png: The image bridge could not download it."])
  })
})
