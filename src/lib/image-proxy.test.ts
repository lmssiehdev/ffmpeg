import { describe, expect, test } from "bun:test"

import { contentDisposition, fetchPublicImage, ImageProxyError, validatePublicImageUrl } from "@/lib/image-proxy"

const FIXTURES = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xdb],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/gif": [...new TextEncoder().encode("GIF89a")],
  "image/webp": [...new TextEncoder().encode("RIFF0000WEBP")],
  "image/avif": [
    0,
    0,
    0,
    24,
    ...new TextEncoder().encode("ftypavif"),
    0,
    0,
    0,
    0,
    ...new TextEncoder().encode("mif1avif"),
  ],
} as const

describe("validatePublicImageUrl", () => {
  test("accepts public HTTPS DNS hosts", () => {
    expect(validatePublicImageUrl("https://cdn.example.com/photo.png#fragment").href).toBe(
      "https://cdn.example.com/photo.png",
    )
  })

  test("rejects non-public destinations and unsafe URL forms", () => {
    const unsafe = [
      "http://cdn.example.com/photo.png",
      "https://user:secret@cdn.example.com/photo.png",
      "https://cdn.example.com:8443/photo.png",
      "https://localhost/photo.png",
      "https://metadata.internal/photo.png",
      "https://127.0.0.1/photo.png",
      "https://[::1]/photo.png",
      "https://2130706433/photo.png",
      "https://single-label/photo.png",
      "https://bad..example.com/photo.png",
      "https://-bad.example.com/photo.png",
    ]

    for (const value of unsafe) expect(() => validatePublicImageUrl(value)).toThrow(ImageProxyError)
  })

  test("rejects recursion to the image endpoint origin", () => {
    expect(() => validatePublicImageUrl("https://app.example.com/api/image", "https://app.example.com")).toThrow(
      ImageProxyError,
    )
  })
})

describe("fetchPublicImage", () => {
  for (const [contentType, bytes] of Object.entries(FIXTURES)) {
    test(`accepts ${contentType} only when its signature matches`, async () => {
      const image = await fetchPublicImage("https://cdn.example.com/photo", {
        fetcher: () =>
          Promise.resolve(new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType } })),
      })

      expect(image.contentType).toBe(contentType)
      expect(image.filename).toContain("photo")
    })
  }

  test("rejects MIME and signature mismatches", async () => {
    await expect(
      fetchPublicImage("https://cdn.example.com/fake.png", {
        fetcher: () =>
          Promise.resolve(
            new Response(new Uint8Array(FIXTURES["image/jpeg"]), { headers: { "Content-Type": "image/png" } }),
          ),
      }),
    ).rejects.toMatchObject({ status: 415 })
  })

  test("rejects unsupported MIME types before returning content", async () => {
    await expect(
      fetchPublicImage("https://cdn.example.com/vector.svg", {
        fetcher: () => Promise.resolve(new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } })),
      }),
    ).rejects.toMatchObject({ status: 415 })
  })

  test("enforces the byte limit when Content-Length is missing or false", async () => {
    for (const contentLength of [undefined, "1"]) {
      const headers = new Headers({ "Content-Type": "image/jpeg" })
      if (contentLength) headers.set("Content-Length", contentLength)
      await expect(
        fetchPublicImage("https://cdn.example.com/photo.jpg", {
          maxBytes: 3,
          fetcher: () => Promise.resolve(new Response(new Uint8Array(FIXTURES["image/jpeg"]), { headers })),
        }),
      ).rejects.toMatchObject({ status: 413 })
    }
  })

  test("rejects oversized declared bodies before reading", async () => {
    await expect(
      fetchPublicImage("https://cdn.example.com/photo.jpg", {
        maxBytes: 3,
        fetcher: () =>
          Promise.resolve(
            new Response(new Uint8Array(FIXTURES["image/jpeg"]), {
              headers: { "Content-Length": "4", "Content-Type": "image/jpeg" },
            }),
          ),
      }),
    ).rejects.toMatchObject({ status: 413 })
  })

  test("revalidates redirects and forwards no request credentials", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const image = await fetchPublicImage("https://images.example.com/start", {
      fetcher: (input, init) => {
        calls.push({ url: String(input), init })
        if (calls.length === 1) {
          return Promise.resolve(
            new Response(null, { status: 302, headers: { Location: "https://cdn.example.net/final.png" } }),
          )
        }
        return Promise.resolve(
          new Response(new Uint8Array(FIXTURES["image/png"]), { headers: { "Content-Type": "image/png" } }),
        )
      },
    })

    expect(image.filename).toBe("final.png")
    expect(calls).toHaveLength(2)
    expect(new Headers(calls[0]?.init?.headers).has("Authorization")).toBe(false)
    expect(new Headers(calls[0]?.init?.headers).has("Cookie")).toBe(false)
    expect(calls.every((call) => call.init?.redirect === "manual")).toBe(true)
  })

  test("blocks a redirect to a private destination", async () => {
    await expect(
      fetchPublicImage("https://images.example.com/start", {
        fetcher: () =>
          Promise.resolve(new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/x" } })),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

test("contentDisposition provides ASCII and UTF-8 filenames", () => {
  expect(contentDisposition("été image.png")).toBe(
    `attachment; filename="_t_ image.png"; filename*=UTF-8''%C3%A9t%C3%A9%20image.png`,
  )
})
