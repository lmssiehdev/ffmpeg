import { describe, expect, test } from "bun:test"

import { executeShellCommand } from "@/features/terminal/shell"

describe("executeShellCommand", () => {
  test("runs standalone FFmpeg commands through the direct path", async () => {
    const received: string[][] = []
    const controller = new AbortController()

    const result = await executeShellCommand(
      `ffmpeg -i 'my clip.mp4' output.mp4`,
      [],
      {
        runFfmpeg: async (args, signal) => {
          expect(signal).toBe(controller.signal)
          received.push(args)
          return { exitCode: 0, outputNames: ["output.mp4"] }
        },
      },
      controller.signal,
    )

    expect(received).toEqual([["-i", "my clip.mp4", "output.mp4"]])
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 })
  })

  test("keeps compound commands on the Bash path", async () => {
    const result = await executeShellCommand("printf hello | printf world", [], {
      runFfmpeg: async () => ({ exitCode: 0, outputNames: [] }),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("world")
  })
})
