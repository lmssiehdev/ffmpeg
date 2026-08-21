import { z } from "zod"

import {
  workspaceCommandRunner,
  WorkspaceCommandBusyError,
  type WorkspaceCommandResult,
} from "@/features/terminal/command-runner"
import { useWorkspaceStore } from "@/features/workspace/store"
import type { WorkspaceAsset } from "@/features/workspace/types"

const MAX_REQUEST_CACHE = 50
const DEFAULT_CHUNK_BYTES = 256 * 1024
const MAX_CHUNK_BYTES = 1024 * 1024
const runRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  command: z.string().trim().min(1).max(20_000),
})
const chunkRequestSchema = z.object({
  fileId: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  maxBytes: z.number().int().positive().optional(),
})

export type WorkspaceApiErrorCode = "BUSY" | "CANCELLED" | "COMMAND_FAILED" | "FILE_NOT_FOUND" | "INVALID_REQUEST"

export type WorkspaceApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: WorkspaceApiErrorCode; message: string } }

export interface WorkspaceApiFile {
  id: string
  name: string
  type: string
  size: number
  source: WorkspaceAsset["source"]
  status: WorkspaceAsset["status"]
}

export interface WorkspaceApiStatus {
  ready: boolean
  busy: boolean
  activeRequestId: string | null
  bootstrap: "pending" | "ready"
}

export interface WorkspaceApiRunRequest {
  requestId: string
  command: string
}

export interface WorkspaceApiRunResult {
  requestId: string
  exitCode: number
  stdout: string
  stderr: string
  outputs: WorkspaceApiFile[]
}

export interface WorkspaceApiFileChunk {
  file: WorkspaceApiFile
  offset: number
  nextOffset: number
  done: boolean
  base64: string
}

export interface FfmpegWorkspaceApiV1 {
  readonly version: 1
  ready(): Promise<WorkspaceApiStatus>
  status(): WorkspaceApiStatus
  run(request: WorkspaceApiRunRequest): Promise<WorkspaceApiResult<WorkspaceApiRunResult>>
  cancel(requestId?: string): WorkspaceApiResult<{ cancelled: boolean }>
  listFiles(): WorkspaceApiFile[]
  readFileChunk(request: {
    fileId: string
    offset?: number
    maxBytes?: number
  }): Promise<WorkspaceApiResult<WorkspaceApiFileChunk>>
}

interface BrowserApiDependencies {
  runCommand: (command: string) => Promise<WorkspaceCommandResult>
  cancelCommand: () => void
  isBusy: () => boolean
  getFiles: () => WorkspaceAsset[]
}

function publicFile(asset: WorkspaceAsset): WorkspaceApiFile {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    source: asset.source,
    status: asset.status,
  }
}

function failure(code: WorkspaceApiErrorCode, message: string) {
  return { ok: false, error: { code, message } } as const
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  const stride = 32 * 1024
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stride))
  }
  return btoa(binary)
}

export function createFfmpegWorkspaceApi(dependencies: BrowserApiDependencies) {
  let bootstrapReady = false
  let resolveBootstrap: (() => void) | undefined
  const bootstrapPromise = new Promise<void>((resolve) => {
    resolveBootstrap = resolve
  })
  let activeRequestId: string | null = null
  const requests = new Map<string, Promise<WorkspaceApiResult<WorkspaceApiRunResult>>>()

  const status = (): WorkspaceApiStatus => ({
    ready: bootstrapReady,
    busy: dependencies.isBusy(),
    activeRequestId,
    bootstrap: bootstrapReady ? "ready" : "pending",
  })

  const api: FfmpegWorkspaceApiV1 = {
    version: 1,

    async ready() {
      await bootstrapPromise
      return status()
    },

    status,

    run(request) {
      const parsed = runRequestSchema.safeParse(request)
      if (!parsed.success) {
        return Promise.resolve(failure("INVALID_REQUEST", "Provide a requestId and a command up to 20,000 characters."))
      }
      const validRequest = parsed.data
      const existing = requests.get(validRequest.requestId)
      if (existing) return existing

      const execution = (async (): Promise<WorkspaceApiResult<WorkspaceApiRunResult>> => {
        await bootstrapPromise
        if (dependencies.isBusy()) return failure("BUSY", "Another workspace command is already running.")

        activeRequestId = validRequest.requestId
        try {
          const result = await dependencies.runCommand(validRequest.command)
          return {
            ok: true,
            value: {
              requestId: validRequest.requestId,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              outputs: result.outputs.map((output) => ({
                id:
                  dependencies.getFiles().find((asset) => asset.source === "output" && asset.name === output.name)
                    ?.id ?? output.name,
                name: output.name,
                type: output.type,
                size: output.size,
                source: "output",
                status: "ready",
              })),
            },
          }
        } catch (error) {
          if (error instanceof WorkspaceCommandBusyError) {
            return failure("BUSY", error.message)
          }
          if (error instanceof DOMException && error.name === "AbortError") {
            return failure("CANCELLED", "The workspace command was cancelled.")
          }
          return failure("COMMAND_FAILED", error instanceof Error ? error.message : "The workspace command failed.")
        } finally {
          if (activeRequestId === validRequest.requestId) activeRequestId = null
        }
      })()

      requests.set(validRequest.requestId, execution)
      if (requests.size > MAX_REQUEST_CACHE) requests.delete(requests.keys().next().value ?? "")
      return execution
    },

    cancel(requestId) {
      if (!activeRequestId || (requestId && requestId !== activeRequestId)) {
        return { ok: true, value: { cancelled: false } }
      }
      dependencies.cancelCommand()
      return { ok: true, value: { cancelled: true } }
    },

    listFiles() {
      return dependencies.getFiles().map(publicFile)
    },

    async readFileChunk(request) {
      const parsed = chunkRequestSchema.safeParse(request)
      if (!parsed.success) return failure("INVALID_REQUEST", "Provide a fileId and valid chunk offsets.")
      const validRequest = parsed.data

      const asset = dependencies.getFiles().find((candidate) => candidate.id === validRequest.fileId)
      if (!asset) return failure("FILE_NOT_FOUND", "The workspace file was not found.")

      const offset = validRequest.offset ?? 0
      const requestedBytes = validRequest.maxBytes ?? DEFAULT_CHUNK_BYTES
      if (offset > asset.blob.size) {
        return failure("INVALID_REQUEST", "Chunk offsets and sizes must be positive integers.")
      }

      const maxBytes = Math.min(requestedBytes, MAX_CHUNK_BYTES)
      const nextOffset = Math.min(offset + maxBytes, asset.blob.size)
      const bytes = new Uint8Array(await asset.blob.slice(offset, nextOffset).arrayBuffer())
      return {
        ok: true,
        value: {
          file: publicFile(asset),
          offset,
          nextOffset,
          done: nextOffset >= asset.blob.size,
          base64: bytesToBase64(bytes),
        },
      }
    },
  }

  return {
    api: Object.freeze(api),
    markBootstrapReady() {
      if (bootstrapReady) return
      bootstrapReady = true
      resolveBootstrap?.()
    },
  }
}

const browserApiController = createFfmpegWorkspaceApi({
  runCommand: (command) => workspaceCommandRunner.run(command, { source: "agent" }),
  cancelCommand: () => workspaceCommandRunner.cancel(),
  isBusy: () => useWorkspaceStore.getState().commandRunning,
  getFiles: () => useWorkspaceStore.getState().assets,
})

export function installFfmpegWorkspaceApi(target: Window = window) {
  if (target.ffmpegWorkspace === browserApiController.api) return browserApiController.api

  Object.defineProperty(target, "ffmpegWorkspace", {
    value: browserApiController.api,
    configurable: true,
    enumerable: false,
  })
  target.dispatchEvent(new CustomEvent("ffmpeg-workspace-api-ready", { detail: { version: 1 } }))
  return browserApiController.api
}

export function markFfmpegWorkspaceBootstrapReady() {
  browserApiController.markBootstrapReady()
}

declare global {
  interface Window {
    ffmpegWorkspace?: FfmpegWorkspaceApiV1
  }

  interface WindowEventMap {
    "ffmpeg-workspace-api-ready": CustomEvent<{ version: 1 }>
  }
}
