import { describe, expect, test } from "bun:test"

import { parseSimpleFfmpegCommand } from "@/features/terminal/simple-ffmpeg-command"

describe("parseSimpleFfmpegCommand", () => {
  test("parses quoted and escaped arguments", () => {
    expect(parseSimpleFfmpegCommand(`ffmpeg -i 'my clip.mp4' "an output.mp4"`)).toEqual([
      "-i",
      "my clip.mp4",
      "an output.mp4",
    ])
    expect(parseSimpleFfmpegCommand("ffmpeg -i my\\ clip.mp4 output.mp4")).toEqual(["-i", "my clip.mp4", "output.mp4"])
  })

  test("preserves empty quoted arguments", () => {
    expect(parseSimpleFfmpegCommand(`ffmpeg -metadata comment='' output.mp4`)).toEqual([
      "-metadata",
      "comment=",
      "output.mp4",
    ])
  })

  test("delegates shell behavior and malformed quoting to just-bash", () => {
    expect(parseSimpleFfmpegCommand("ffmpeg -version | head")).toBeNull()
    expect(parseSimpleFfmpegCommand("ffmpeg -i $INPUT output.mp4")).toBeNull()
    expect(parseSimpleFfmpegCommand("ffmpeg -i *.mp4 output.mp4")).toBeNull()
    expect(parseSimpleFfmpegCommand("ffmpeg -i 'unfinished")).toBeNull()
    expect(parseSimpleFfmpegCommand("echo ffmpeg")).toBeNull()
  })
})
