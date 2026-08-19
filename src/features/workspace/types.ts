export type AssetSource = "upload" | "output"
export type AssetStatus = "ready" | "error"
export type EngineStatus = "idle" | "loading" | "ready" | "running" | "error"

export interface WorkspaceAsset {
  id: string
  name: string
  blob: Blob
  size: number
  type: string
  source: AssetSource
  status: AssetStatus
  progress: number
  objectUrl: string
  createdAt: number
  error?: string
}

export interface TerminalEntry {
  id: string
  kind: "command" | "stdout" | "stderr" | "system" | "log"
  text: string
  createdAt: number
}

export interface FfmpegOutput {
  name: string
  blob: Blob
}
