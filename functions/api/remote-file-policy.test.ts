import { describe, expect, test } from "bun:test"

import { createRemoteFilePolicy, limitBody, RemoteFilePolicyError, validateRemoteUrl } from "./remote-file-policy"

describe("remote file host policy", () => {
  test("fails closed without an allowlist", () => {
    expect(() => createRemoteFilePolicy(undefined)).toThrow(RemoteFilePolicyError)
  })

  test("rejects invalid or oversized byte limits", () => {
    for (const value of ["0", "not-a-number", String(512 * 1024 * 1024 + 1)]) {
      expect(() => createRemoteFilePolicy("media.example.com", value)).toThrow(RemoteFilePolicyError)
    }
  })

  test("allows exact hosts and explicit wildcard subdomains", () => {
    const policy = createRemoteFilePolicy("media.example.com, *.cdn.example.com")

    expect(validateRemoteUrl("https://media.example.com/video.mp4", policy).hostname).toBe("media.example.com")
    expect(validateRemoteUrl("https://a.cdn.example.com/video.mp4", policy).hostname).toBe("a.cdn.example.com")
    expect(() => validateRemoteUrl("https://cdn.example.com/video.mp4", policy)).toThrow(RemoteFilePolicyError)
  })

  test("rejects unsafe URL forms", () => {
    const policy = createRemoteFilePolicy("media.example.com")
    const unsafeUrls = [
      "http://media.example.com/file.mp4",
      "https://user:secret@media.example.com/file.mp4",
      "https://media.example.com:8443/file.mp4",
      "https://other.example.com/file.mp4",
    ]

    for (const url of unsafeUrls) expect(() => validateRemoteUrl(url, policy)).toThrow(RemoteFilePolicyError)
  })

  test("rejects IP literals and internal host suffixes in configuration", () => {
    for (const host of ["127.0.0.1", "[::1]", "metadata.internal", "host.local"]) {
      expect(() => createRemoteFilePolicy(host)).toThrow(RemoteFilePolicyError)
    }
  })
})

test("limitBody cancels a stream after the byte cap", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]))
      controller.enqueue(new Uint8Array([3, 4]))
      controller.close()
    },
  })

  await expect(new Response(limitBody(stream, 3)).arrayBuffer()).rejects.toThrow("configured size limit")
})
