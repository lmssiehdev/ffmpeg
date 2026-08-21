import { ZodError } from "zod"

import { executeShellCommand } from "@/features/terminal/shell"
import { useWorkspaceStore } from "@/features/workspace/store"
import type { WorkspaceAsset } from "@/features/workspace/types"
import { ffmpegEngine, type EngineRunResult, type EngineTimings } from "@/lib/ffmpeg/engine"

export type CommandSource = "user" | "agent"

export interface WorkspaceCommandOutput {
  name: string
  type: string
  size: number
  blob: Blob
  url: string
}

export interface WorkspaceCommandResult {
  exitCode: number
  stdout: string
  stderr: string
  outputs: WorkspaceCommandOutput[]
}

export interface RunWorkspaceCommandOptions {
  source?: CommandSource
  signal?: AbortSignal
  onAnnouncement?: (message: string) => void
}

export class WorkspaceCommandBusyError extends Error {
  constructor() {
    super("Another workspace command is already running.")
    this.name = "WorkspaceCommandBusyError"
  }
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1) return "<1ms"
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`
}

function formatTimings(timings: EngineTimings) {
  return [
    `Completed in ${formatDuration(timings.totalMs)}`,
    `load ${formatDuration(timings.loadMs)}`,
    `prepare ${formatDuration(timings.prepareMs)}`,
    `FFmpeg ${formatDuration(timings.executeMs)}`,
    `collect ${formatDuration(timings.collectMs)}`,
  ].join(" · ")
}

function readyAssets() {
  return useWorkspaceStore.getState().assets.filter((asset) => asset.status === "ready")
}

function outputDescriptors(names: Iterable<string>) {
  const wanted = new Set(names)
  return useWorkspaceStore
    .getState()
    .assets.filter((asset) => asset.source === "output" && wanted.has(asset.name))
    .map((asset) => ({
      name: asset.name,
      type: asset.type,
      size: asset.size,
      blob: asset.blob,
      url: asset.objectUrl,
    }))
}

class WorkspaceCommandRunner {
  private controller: AbortController | null = null

  get isRunning() {
    return this.controller !== null
  }

  async run(command: string, options: RunWorkspaceCommandOptions = {}): Promise<WorkspaceCommandResult> {
    if (this.controller) throw new WorkspaceCommandBusyError()

    const script = command.trim()
    const source = options.source ?? "user"
    const controller = new AbortController()
    this.controller = controller

    const abortFromCaller = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener("abort", abortFromCaller, { once: true })
    if (options.signal?.aborted) abortFromCaller()

    useWorkspaceStore.getState().setCommandRunning(true)

    const announce = (message: string) => {
      useWorkspaceStore.getState().setCommandAnnouncement(message)
      options.onAnnouncement?.(message)
    }

    return this.execute(script, source, controller.signal, announce).finally(() => {
      options.signal?.removeEventListener("abort", abortFromCaller)
      if (this.controller === controller) this.controller = null
      const store = useWorkspaceStore.getState()
      store.setCommandRunning(false)
      if (store.engineStatus === "running" || store.engineStatus === "loading") store.setEngine("ready", null)
    })
  }

  cancel() {
    if (!this.controller) return
    this.controller.abort(new DOMException("Workspace command cancelled.", "AbortError"))
    ffmpegEngine.cancel()
    useWorkspaceStore.getState().setEngine("idle", null)
  }

  private async execute(
    script: string,
    source: CommandSource,
    signal: AbortSignal,
    announce: ((message: string) => void) | undefined,
  ): Promise<WorkspaceCommandResult> {
    const store = useWorkspaceStore.getState()
    const outputNames = new Set<string>()

    store.appendTerminal("command", script)
    if (source === "user") store.addHistory(script)
    announce?.(source === "agent" ? "Agent command running." : "Command running.")

    const runFfmpeg = async (args: string[], runSignal?: AbortSignal) => {
      const result = await this.runFfmpeg(args, readyAssets(), runSignal ?? signal, announce)
      for (const name of result.outputs.map((output) => output.name)) outputNames.add(name)
      return { exitCode: result.exitCode, outputNames: result.outputs.map((output) => output.name) }
    }

    try {
      const result = await executeShellCommand(script, readyAssets(), { runFfmpeg }, signal)
      if (result.stdout) store.appendTerminal("stdout", result.stdout)
      if (result.stderr) store.appendTerminal("stderr", result.stderr)

      if (!script.startsWith("ffmpeg")) {
        announce?.(result.exitCode === 0 ? "Command completed." : `Command failed with exit code ${result.exitCode}.`)
      }

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        outputs: outputDescriptors(outputNames),
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const message = "Command must be between 1 and 20,000 characters."
        store.appendTerminal("stderr", message)
        announce?.(`Command rejected. ${message}`)
        throw new Error(message)
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        store.appendTerminal("system", "Command cancelled.")
        announce?.("Command cancelled.")
        throw error
      }

      const message = error instanceof Error ? error.message : "Shell command failed."
      store.appendTerminal("stderr", message)
      announce?.(`Command failed: ${message}`)
      throw error
    }
  }

  private async runFfmpeg(
    args: string[],
    assets: WorkspaceAsset[],
    signal: AbortSignal,
    announce: ((message: string) => void) | undefined,
  ): Promise<EngineRunResult> {
    const store = useWorkspaceStore.getState()
    const logBuffer: string[] = []
    const flushLogs = () => {
      if (!logBuffer.length) return
      store.appendTerminal("log", logBuffer.splice(0).join("\n"))
    }
    const flushTimer = globalThis.setInterval(flushLogs, 150)

    try {
      const result = await ffmpegEngine.run(
        args,
        assets,
        {
          onPhase: (phase) => {
            store.setEngine(phase, phase === "running" ? 0 : null)
            announce?.(phase === "loading" ? "Loading FFmpeg." : "FFmpeg command running.")
          },
          onLog: (_type, message) => {
            logBuffer.push(message)
            if (logBuffer.length > 200) flushLogs()
          },
          onProgress: (progress) => store.setEngine("running", progress),
        },
        signal,
      )

      for (const output of result.outputs) store.upsertOutput(output.name, output.blob)
      flushLogs()
      store.appendTerminal("system", formatTimings(result.timings))
      store.setEngine(
        result.exitCode === 0 ? "ready" : "error",
        null,
        result.exitCode === 0 ? null : `FFmpeg exited with code ${result.exitCode}.`,
      )
      announce?.(
        result.exitCode === 0
          ? `FFmpeg command completed${result.outputs.length ? ` with ${result.outputs.length} output${result.outputs.length === 1 ? "" : "s"}` : ""}.`
          : `FFmpeg command failed with exit code ${result.exitCode}.`,
      )
      return result
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
      const message = error instanceof Error ? error.message : "FFmpeg failed unexpectedly."
      store.setEngine("error", null, message)
      throw error
    } finally {
      globalThis.clearInterval(flushTimer)
      flushLogs()
    }
  }
}

export const workspaceCommandRunner = new WorkspaceCommandRunner()
