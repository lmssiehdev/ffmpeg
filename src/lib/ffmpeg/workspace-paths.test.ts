import { describe, expect, test } from "bun:test"

import type { WorkspaceAsset } from "@/features/workspace/types"
import { referencedRootFileNames, rewriteMountedInputArguments } from "@/lib/ffmpeg/workspace-paths"

function asset(name: string, source: WorkspaceAsset["source"] = "upload"): WorkspaceAsset {
  return {
    id: name,
    name,
    blob: new Blob(),
    size: 0,
    type: "video/mp4",
    source,
    status: "ready",
    progress: 100,
    objectUrl: "blob:test",
    createdAt: 0,
  }
}

describe("rewriteMountedInputArguments", () => {
  test("rewrites input operands without touching output paths or filter expressions", () => {
    const args = ["-i", "./my clip.mp4", "-vf", "subtitles=my clip.mp4", "my clip.mp4"]

    expect(rewriteMountedInputArguments(args, [asset("my clip.mp4")])).toEqual([
      "-i",
      "/inputs/my clip.mp4",
      "-vf",
      "subtitles=my clip.mp4",
      "my clip.mp4",
    ])
  })

  test("accepts the root-style paths supported by the previous MEMFS workspace", () => {
    expect(rewriteMountedInputArguments(["-i", "/clip.mp4"], [asset("clip.mp4")])).toEqual(["-i", "/inputs/clip.mp4"])
  })
})

describe("referencedRootFileNames", () => {
  test("returns only direct root file references", () => {
    expect(referencedRootFileNames(["-i", "./old.mp4", "/new.mp4", "/inputs/source.mp4", "scale=1280:720"])).toEqual(
      new Set(["-i", "old.mp4", "new.mp4", "scale=1280:720"]),
    )
  })
})
