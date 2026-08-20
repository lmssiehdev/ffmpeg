import type { WorkspaceAsset } from "@/features/workspace/types"
import {
  FFMPEG_INPUT_DIRECTORY,
  referencedRootFileNames,
  rewriteMountedInputArguments,
} from "@/lib/ffmpeg/workspace-paths"
import { inferMimeType } from "@/lib/utils"

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg
type FFmpegRuntime = typeof import("@ffmpeg/ffmpeg")

const FFMPEG_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm"

interface RunOptions {
  onLog: (type: "stdout" | "stderr", message: string) => void
  onProgress: (progress: number) => void
  onPhase: (phase: "loading" | "running") => void
}

export interface EngineTimings {
  loadMs: number
  prepareMs: number
  executeMs: number
  collectMs: number
  totalMs: number
}

export interface EngineRunResult {
  exitCode: number
  outputs: Array<{ name: string; blob: Blob }>
  timings: EngineTimings
}

function elapsedSince(start: number) {
  return performance.now() - start
}

function sameBlobMap(left: Map<string, Blob>, right: Map<string, Blob>) {
  if (left.size !== right.size) return false
  for (const [name, blob] of left) {
    if (right.get(name) !== blob) return false
  }
  return true
}

function blobFromFileData(name: string, data: Uint8Array) {
  const bytes =
    data.buffer instanceof ArrayBuffer
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : Uint8Array.from(data)

  return new Blob([bytes], { type: inferMimeType(name) })
}

class BrowserFfmpegEngine {
  private runtimePromise: Promise<FFmpegRuntime> | null = null
  private ffmpeg: FFmpegInstance | null = null
  private loadPromise: Promise<void> | null = null
  private mountedInputs = new Map<string, Blob>()
  private inputsMounted = false
  private inputDirectoryReady = false
  private stagedOutputs = new Map<string, Blob>()
  private knownOutputs = new Set<string>()
  private generation = 0
  private active = false

  private assertCurrent(generation: number, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (generation !== this.generation) throw new DOMException("FFmpeg command cancelled.", "AbortError")
  }

  private getRuntime() {
    this.runtimePromise ??= import("@ffmpeg/ffmpeg")
    return this.runtimePromise
  }

  private async getInstance(generation: number, signal?: AbortSignal) {
    if (this.ffmpeg) return this.ffmpeg

    const { FFmpeg } = await this.getRuntime()
    this.assertCurrent(generation, signal)
    this.ffmpeg = new FFmpeg()
    return this.ffmpeg
  }

  private async load(generation: number, signal?: AbortSignal) {
    if (this.ffmpeg?.loaded) return
    if (this.loadPromise) {
      await this.loadPromise
      this.assertCurrent(generation, signal)
      return
    }

    this.loadPromise = (async () => {
      const ffmpeg = await this.getInstance(generation, signal)
      await ffmpeg.load(
        {
          coreURL: `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
          wasmURL: `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
        },
        { signal },
      )
    })()

    try {
      await this.loadPromise
      this.assertCurrent(generation, signal)
    } finally {
      if (generation === this.generation) this.loadPromise = null
    }
  }

  private async ensureInputDirectory(ffmpeg: FFmpegInstance, generation: number, signal?: AbortSignal) {
    if (this.inputDirectoryReady) return
    await ffmpeg.createDir(FFMPEG_INPUT_DIRECTORY, { signal })
    this.assertCurrent(generation, signal)
    this.inputDirectoryReady = true
  }

  private async syncInputs(ffmpeg: FFmpegInstance, assets: WorkspaceAsset[], generation: number, signal?: AbortSignal) {
    const nextInputs = new Map(
      assets
        .filter((asset) => asset.source === "upload" && asset.status === "ready")
        .map((asset) => [asset.name, asset.blob] as const),
    )
    if (sameBlobMap(this.mountedInputs, nextInputs)) return

    if (this.inputsMounted) {
      await ffmpeg.unmount(FFMPEG_INPUT_DIRECTORY)
      this.assertCurrent(generation, signal)
      this.inputsMounted = false
    }

    await this.ensureInputDirectory(ffmpeg, generation, signal)
    if (nextInputs.size > 0) {
      const { FFFSType } = await this.getRuntime()
      this.assertCurrent(generation, signal)
      await ffmpeg.mount(
        FFFSType.WORKERFS,
        { blobs: [...nextInputs].map(([name, data]) => ({ name, data })) },
        FFMPEG_INPUT_DIRECTORY,
      )
      this.assertCurrent(generation, signal)
      this.inputsMounted = true
    }

    this.mountedInputs = nextInputs
  }

  private async syncOutputs(
    ffmpeg: FFmpegInstance,
    assets: WorkspaceAsset[],
    generation: number,
    signal?: AbortSignal,
  ) {
    const outputs = assets.filter((asset) => asset.source === "output" && asset.status === "ready")
    const workspaceNames = new Set(outputs.map((asset) => asset.name))

    for (const name of this.knownOutputs) {
      if (workspaceNames.has(name)) continue
      await ffmpeg.deleteFile(name, { signal }).catch(() => undefined)
      this.assertCurrent(generation, signal)
      this.knownOutputs.delete(name)
      this.stagedOutputs.delete(name)
    }

    for (const output of outputs) {
      if (this.stagedOutputs.get(output.name) === output.blob) continue

      const bytes = new Uint8Array(await output.blob.arrayBuffer())
      this.assertCurrent(generation, signal)
      await ffmpeg.writeFile(output.name, bytes, { signal })
      this.assertCurrent(generation, signal)
      this.stagedOutputs.set(output.name, output.blob)
      this.knownOutputs.add(output.name)
    }
  }

  private async rootFileNames(ffmpeg: FFmpegInstance, signal?: AbortSignal) {
    const entries = await ffmpeg.listDir("/", { signal })
    return new Set(
      entries.filter((entry) => !entry.isDir && entry.name !== "." && entry.name !== "..").map((entry) => entry.name),
    )
  }

  private async removeNewFiles(ffmpeg: FFmpegInstance, beforeNames: Set<string>, signal?: AbortSignal) {
    const afterNames = await this.rootFileNames(ffmpeg, signal)
    await Promise.all(
      [...afterNames]
        .filter((name) => !beforeNames.has(name))
        .map((name) => ffmpeg.deleteFile(name, { signal }).catch(() => undefined)),
    )
  }

  async run(
    args: string[],
    assets: WorkspaceAsset[],
    options: RunOptions,
    signal?: AbortSignal,
  ): Promise<EngineRunResult> {
    if (this.active) throw new Error("An FFmpeg command is already running.")

    this.active = true
    const totalStartedAt = performance.now()
    const generation = this.generation
    let ffmpeg: FFmpegInstance | null = null
    let loadMs = 0
    let prepareMs = 0
    let executeMs = 0
    let collectMs = 0

    const timings = (): EngineTimings => ({
      loadMs,
      prepareMs,
      executeMs,
      collectMs,
      totalMs: elapsedSince(totalStartedAt),
    })
    const onLog = ({ type, message }: { type: string; message: string }) => {
      if (generation !== this.generation || message.trim() === "Aborted()") return
      options.onLog(type === "stdout" ? "stdout" : "stderr", message)
    }
    const onProgress = ({ progress }: { progress: number }) => {
      if (generation !== this.generation || !Number.isFinite(progress)) return
      options.onProgress(Math.max(0, Math.min(1, progress)))
    }

    try {
      options.onPhase("loading")
      const loadStartedAt = performance.now()
      await this.load(generation, signal)
      loadMs = elapsedSince(loadStartedAt)
      this.assertCurrent(generation, signal)

      ffmpeg = await this.getInstance(generation, signal)
      ffmpeg.on("log", onLog)
      ffmpeg.on("progress", onProgress)

      const prepareStartedAt = performance.now()
      await this.syncInputs(ffmpeg, assets, generation, signal)
      await this.syncOutputs(ffmpeg, assets, generation, signal)
      const beforeNames = await this.rootFileNames(ffmpeg, signal)
      prepareMs = elapsedSince(prepareStartedAt)
      this.assertCurrent(generation, signal)

      options.onPhase("running")
      const executionStartedAt = performance.now()
      const exitCode = await ffmpeg.exec(rewriteMountedInputArguments(args, assets), undefined, { signal })
      executeMs = elapsedSince(executionStartedAt)
      this.assertCurrent(generation, signal)

      if (exitCode !== 0) {
        await this.removeNewFiles(ffmpeg, beforeNames, signal)
        const referencedNames = referencedRootFileNames(args)
        for (const asset of assets) {
          if (asset.source !== "output" || !referencedNames.has(asset.name)) continue
          await ffmpeg.deleteFile(asset.name, { signal }).catch(() => undefined)
          this.stagedOutputs.delete(asset.name)
          this.knownOutputs.delete(asset.name)
        }
        return { exitCode, outputs: [], timings: timings() }
      }

      const collectionStartedAt = performance.now()
      const afterNames = await this.rootFileNames(ffmpeg, signal)
      const referencedNames = referencedRootFileNames(args)
      const outputNames = new Set(
        assets
          .filter((asset) => asset.source === "output" && referencedNames.has(asset.name))
          .map((asset) => asset.name),
      )

      for (const name of afterNames) {
        if (!beforeNames.has(name)) outputNames.add(name)
      }

      const outputs: EngineRunResult["outputs"] = []
      for (const name of outputNames) {
        const data = await ffmpeg.readFile(name, undefined, { signal })
        this.assertCurrent(generation, signal)
        if (!(data instanceof Uint8Array)) continue

        const blob = blobFromFileData(name, data)
        outputs.push({ name, blob })
        this.stagedOutputs.set(name, blob)
        this.knownOutputs.add(name)
      }
      collectMs = elapsedSince(collectionStartedAt)

      return { exitCode, outputs, timings: timings() }
    } finally {
      ffmpeg?.off("log", onLog)
      ffmpeg?.off("progress", onProgress)
      this.active = false
    }
  }

  cancel() {
    this.generation += 1
    this.ffmpeg?.terminate()
    this.ffmpeg = null
    this.loadPromise = null
    this.mountedInputs.clear()
    this.inputsMounted = false
    this.inputDirectoryReady = false
    this.stagedOutputs.clear()
    this.knownOutputs.clear()
  }
}

export const ffmpegEngine = new BrowserFfmpegEngine()
