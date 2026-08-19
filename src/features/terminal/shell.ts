import type { CommandName } from "just-bash/browser"
import { z } from "zod"

import { parseSimpleFfmpegCommand } from "@/features/terminal/simple-ffmpeg-command"
import type { WorkspaceAsset } from "@/features/workspace/types"

const commandSchema = z.string().trim().min(1).max(20_000)
const browserCommands: CommandName[] = [
  "alias",
  "basename",
  "clear",
  "date",
  "dirname",
  "echo",
  "env",
  "expr",
  "false",
  "find",
  "help",
  "history",
  "ls",
  "printenv",
  "printf",
  "pwd",
  "seq",
  "sleep",
  "stat",
  "time",
  "timeout",
  "true",
  "unalias",
  "which",
  "whoami",
]

export interface ShellCallbacks {
  runFfmpeg: (args: string[], signal?: AbortSignal) => Promise<{ exitCode: number; outputNames: string[] }>
}

export async function executeShellCommand(
  command: string,
  assets: WorkspaceAsset[],
  callbacks: ShellCallbacks,
  signal?: AbortSignal,
) {
  const script = commandSchema.parse(command)
  const directArguments = parseSimpleFfmpegCommand(script)

  if (directArguments) {
    const result = await callbacks.runFfmpeg(directArguments, signal)
    return {
      stdout: "",
      stderr: result.exitCode === 0 ? "" : `ffmpeg exited with code ${result.exitCode}\n`,
      exitCode: result.exitCode,
    }
  }

  const { Bash, defineCommand } = await import("just-bash/browser")
  let workspaceRoot = ""

  const ffmpegCommand = defineCommand("ffmpeg", async (args, context) => {
    if (context.cwd !== workspaceRoot) {
      return {
        stdout: "",
        stderr: "ffmpeg must run from the workspace root; subdirectory execution is not supported.\n",
        exitCode: 2,
      }
    }

    const result = await callbacks.runFfmpeg(args, signal)

    for (const outputName of result.outputNames) {
      const path = `${context.cwd.replace(/\/$/, "")}/${outputName}`
      await context.fs.writeFile(path, "")
    }

    return {
      stdout: "",
      stderr: result.exitCode === 0 ? "" : `ffmpeg exited with code ${result.exitCode}\n`,
      exitCode: result.exitCode,
    }
  })

  const bash = new Bash({ commands: browserCommands, customCommands: [ffmpegCommand] })
  const cwd = bash.getCwd()
  workspaceRoot = cwd

  for (const asset of assets) {
    await bash.fs.writeFile(`${cwd}/${asset.name}`, "")
  }

  return bash.exec(script, { signal })
}

export function quoteWorkspaceFile(name: string) {
  if (name.includes("\0")) throw new Error("Workspace filenames cannot contain NUL.")
  return `'./${name.replaceAll("'", `'"'"'`)}'`
}

export function completeFilename(command: string, assets: WorkspaceAsset[]) {
  const match = command.match(/(?:^|\s)([^\s]*)$/)
  const fragment = match?.[1] ?? ""
  const unquoted = fragment.replace(/^['"]/, "")
  if (!unquoted) return command

  const candidates = assets.map((asset) => asset.name).filter((name) => name.startsWith(unquoted))
  if (candidates.length !== 1) return command

  const name = candidates[0]
  const completed = quoteWorkspaceFile(name)
  return `${command.slice(0, command.length - fragment.length)}${completed}`
}
