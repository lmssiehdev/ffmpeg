import { describe, expect, test } from "bun:test"

import { getMediaPreviewKind, isVisualPreview } from "@/features/workspace/media-preview"

describe("getMediaPreviewKind", () => {
  test("classifies browser media by MIME family", () => {
    expect(getMediaPreviewKind({ type: "image/avif", status: "ready" })).toBe("image")
    expect(getMediaPreviewKind({ type: "video/mp4", status: "ready" })).toBe("video")
    expect(getMediaPreviewKind({ type: "audio/mpeg", status: "ready" })).toBe("audio")
  })

  test("uses the fallback for unsupported and unavailable files", () => {
    expect(getMediaPreviewKind({ type: "text/vtt", status: "ready" })).toBe("unsupported")
    expect(getMediaPreviewKind({ type: "image/png", status: "error" })).toBe("unsupported")
  })
})

test("isVisualPreview only includes image and video surfaces", () => {
  expect(isVisualPreview("image")).toBe(true)
  expect(isVisualPreview("video")).toBe(true)
  expect(isVisualPreview("audio")).toBe(false)
  expect(isVisualPreview("unsupported")).toBe(false)
})
