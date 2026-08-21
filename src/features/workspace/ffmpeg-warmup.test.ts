import { describe, expect, test } from "bun:test"

import { canAutomaticallyPrepareFfmpeg } from "@/features/workspace/ffmpeg-warmup"

describe("canAutomaticallyPrepareFfmpeg", () => {
  test("allows visible online sessions on a normal connection", () => {
    expect(canAutomaticallyPrepareFfmpeg({ hidden: false, online: true, saveData: false, effectiveType: "4g" })).toBe(
      true,
    )
  })

  test.each([
    [{ hidden: true, online: true, saveData: false }, "hidden documents"],
    [{ hidden: false, online: false, saveData: false }, "offline sessions"],
    [{ hidden: false, online: true, saveData: true }, "Save-Data sessions"],
    [{ hidden: false, online: true, saveData: false, effectiveType: "slow-2g" }, "slow 2G sessions"],
    [{ hidden: false, online: true, saveData: false, effectiveType: "2g" }, "2G sessions"],
  ])("skips %s", (environment) => {
    expect(canAutomaticallyPrepareFfmpeg(environment)).toBe(false)
  })
})
