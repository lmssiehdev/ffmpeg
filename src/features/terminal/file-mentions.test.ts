import { describe, expect, test } from "bun:test"

import { findFileMention, replaceFileMention } from "@/features/terminal/file-mentions"
import { completeFilename, quoteWorkspaceFile } from "@/features/terminal/shell"
import type { WorkspaceAsset } from "@/features/workspace/types"

function readyAsset(name: string): WorkspaceAsset {
  return {
    id: name,
    name,
    blob: new Blob(),
    size: 0,
    type: "video/mp4",
    source: "upload",
    status: "ready",
    progress: 100,
    objectUrl: "blob:test",
    createdAt: 0,
  }
}

describe("findFileMention", () => {
  test("finds an empty or filtered mention at a shell boundary", () => {
    expect(findFileMention("@", 1)).toMatchObject({ start: 0, end: 1, query: "" })
    expect(findFileMention("ffmpeg -i @clip", 15)).toMatchObject({ start: 10, end: 15, query: "clip" })
    expect(findFileMention("echo ok;@tone", 13)).toMatchObject({ start: 8, end: 13, query: "tone" })
  })

  test("replaces the whole mention token when the caret is in its middle", () => {
    const mention = findFileMention("ffmpeg -i @video.mp4 output.mp3", 16)
    expect(mention).toMatchObject({ start: 10, end: 20, query: "video.mp4" })

    const result = replaceFileMention("ffmpeg -i @video.mp4 output.mp3", mention!, "'./clip.mov'")
    expect(result).toEqual({ value: "ffmpeg -i './clip.mov' output.mp3", caret: 22 })
  })

  test("rejects email-like, selected, escaped, quoted, commented, and substituted text", () => {
    expect(findFileMention("echo x@y", 8)).toBeNull()
    expect(findFileMention("echo @file", 5, 10)).toBeNull()
    expect(findFileMention("echo \\@file", 11)).toBeNull()
    expect(findFileMention("echo ' @file", 12)).toBeNull()
    expect(findFileMention('echo " @file', 12)).toBeNull()
    expect(findFileMention("echo # @file", 12)).toBeNull()
    expect(findFileMention("echo $(cat @file", 16)).toBeNull()
    expect(findFileMention("echo `cat @file", 15)).toBeNull()
  })

  test("supports unicode filenames and new command lines", () => {
    expect(findFileMention("echo ok\n@é", 10)).toMatchObject({ start: 8, query: "é" })
  })
})

describe("quoteWorkspaceFile", () => {
  const cases: Array<[string, string]> = [
    ["clip.mp4", "'./clip.mp4'"],
    ["my clip.mov", "'./my clip.mov'"],
    ["it's.mp3", `'./it'"'"'s.mp3'`],
    ["$(touch nope).mp4", "'./$(touch nope).mp4'"],
    ["-input.mp4", "'./-input.mp4'"],
    ["$HOME;*.mp4", "'./$HOME;*.mp4'"],
  ]

  test.each(cases)("quotes %s as one workspace path", (name, expected) => {
    expect(quoteWorkspaceFile(name)).toBe(expected)
  })

  test("rejects NUL", () => {
    expect(() => quoteWorkspaceFile("bad\0name.mp4")).toThrow("NUL")
  })

  test("round-trips shell-sensitive names as one argv value", async () => {
    const { Bash, defineCommand } = await import("just-bash/browser")
    const received: string[] = []
    const capture = defineCommand("capture", async (args) => {
      received.push(args[0] ?? "")
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const bash = new Bash({ commands: [], customCommands: [capture] })
    const names = ["my clip.mov", "it's.mp3", "$(touch nope).mp4", "-input.mp4", "$HOME;*.mp4"]

    await bash.exec(names.map((name) => `capture ${quoteWorkspaceFile(name)}`).join("\n"))

    expect(received).toEqual(names.map((name) => `./${name}`))
  })
})

describe("completeFilename", () => {
  test("uses the same safe workspace quoting as mentions", () => {
    expect(completeFilename("ffmpeg -i my", [readyAsset("my clip.mov")])).toBe("ffmpeg -i './my clip.mov'")
    expect(completeFilename("ffmpeg -i -i", [readyAsset("-input.mp4")])).toBe("ffmpeg -i './-input.mp4'")
  })
})
