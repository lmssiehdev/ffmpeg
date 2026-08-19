import { create } from "zustand"

import type { EngineStatus, TerminalEntry, WorkspaceAsset } from "@/features/workspace/types"
import { inferMimeType } from "@/lib/utils"

const MAX_TERMINAL_ENTRIES = 800
const MAX_FILE_SIZE = 512 * 1024 * 1024
const MAX_WORKSPACE_SIZE = 768 * 1024 * 1024

function uniqueName(name: string, assets: WorkspaceAsset[]) {
  if (!assets.some((asset) => asset.name === name)) return name

  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ""
  let counter = 2

  while (assets.some((asset) => asset.name === `${stem} (${counter})${extension}`)) {
    counter += 1
  }

  return `${stem} (${counter})${extension}`
}

function makeAsset(
  blob: Blob,
  name: string,
  source: WorkspaceAsset["source"],
  validationError?: string,
): WorkspaceAsset {
  const error =
    validationError ?? (blob.size > MAX_FILE_SIZE ? "File exceeds the 512 MB browser workspace limit." : undefined)

  return {
    id: crypto.randomUUID(),
    name,
    blob,
    size: blob.size,
    type: blob.type && blob.type !== "application/octet-stream" ? blob.type : inferMimeType(name),
    source,
    status: error ? "error" : "ready",
    progress: error ? 0 : 100,
    objectUrl: URL.createObjectURL(blob),
    createdAt: Date.now(),
    error,
  }
}

interface WorkspaceState {
  assets: WorkspaceAsset[]
  selectedAssetId: string | null
  engineStatus: EngineStatus
  engineProgress: number | null
  engineError: string | null
  terminalEntries: TerminalEntry[]
  history: string[]
  addUploads: (files: File[]) => void
  upsertOutput: (name: string, blob: Blob) => void
  retryAsset: (id: string) => void
  removeAsset: (id: string) => void
  selectAsset: (id: string | null) => void
  setEngine: (status: EngineStatus, progress?: number | null, error?: string | null) => void
  appendTerminal: (kind: TerminalEntry["kind"], text: string) => void
  clearTerminal: () => void
  addHistory: (command: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  assets: [],
  selectedAssetId: null,
  engineStatus: "idle",
  engineProgress: null,
  engineError: null,
  terminalEntries: [
    {
      id: crypto.randomUUID(),
      kind: "system",
      text: "Browser workspace ready. Add media, then run ffmpeg --help or an FFmpeg command.",
      createdAt: Date.now(),
    },
  ],
  history: [],

  addUploads: (files) => {
    const nextAssets = [...get().assets]
    let workspaceSize = nextAssets
      .filter((asset) => asset.status === "ready")
      .reduce((total, asset) => total + asset.size, 0)

    for (const file of files) {
      const name = uniqueName(file.name, nextAssets)
      const validationError =
        file.size <= MAX_FILE_SIZE && workspaceSize + file.size > MAX_WORKSPACE_SIZE
          ? "Adding this file would exceed the 768 MB browser workspace limit."
          : undefined
      const asset = makeAsset(file, name, "upload", validationError)
      nextAssets.push(asset)
      if (asset.status === "ready") workspaceSize += asset.size
    }

    set({
      assets: nextAssets,
      selectedAssetId: get().selectedAssetId ?? nextAssets[0]?.id ?? null,
    })
  },

  upsertOutput: (name, blob) => {
    const existing = get().assets.find((asset) => asset.name === name)
    const replacement = makeAsset(blob, name, "output")

    if (!existing) {
      set((state) => ({ assets: [...state.assets, replacement], selectedAssetId: replacement.id }))
      return
    }

    URL.revokeObjectURL(existing.objectUrl)
    replacement.id = existing.id
    set((state) => ({
      assets: state.assets.map((asset) => (asset.id === existing.id ? replacement : asset)),
      selectedAssetId: existing.id,
    }))
  },

  retryAsset: (id) => {
    set((state) => {
      const asset = state.assets.find((candidate) => candidate.id === id)
      if (!asset) return state

      const otherReadySize = state.assets
        .filter((candidate) => candidate.id !== id && candidate.status === "ready")
        .reduce((total, candidate) => total + candidate.size, 0)
      const error =
        asset.size > MAX_FILE_SIZE
          ? "File exceeds the 512 MB browser workspace limit."
          : otherReadySize + asset.size > MAX_WORKSPACE_SIZE
            ? "Adding this file would exceed the 768 MB browser workspace limit."
            : undefined

      return {
        assets: state.assets.map((candidate) =>
          candidate.id === id
            ? { ...candidate, status: error ? "error" : "ready", progress: error ? 0 : 100, error }
            : candidate,
        ),
      }
    })
  },

  removeAsset: (id) => {
    const state = get()
    const removedIndex = state.assets.findIndex((candidate) => candidate.id === id)
    const asset = state.assets[removedIndex]
    if (!asset) return

    const assets = state.assets.filter((candidate) => candidate.id !== id)
    const selectedAssetId =
      state.selectedAssetId === id
        ? (assets[Math.min(removedIndex, assets.length - 1)]?.id ?? null)
        : state.selectedAssetId

    set({ assets, selectedAssetId })
    queueMicrotask(() => URL.revokeObjectURL(asset.objectUrl))
  },

  selectAsset: (id) => set({ selectedAssetId: id }),

  setEngine: (engineStatus, engineProgress = null, engineError = null) =>
    set({ engineStatus, engineProgress, engineError }),

  appendTerminal: (kind, text) => {
    if (!text) return
    const entries = text
      .split("\n")
      .filter(Boolean)
      .map((line) => ({ id: crypto.randomUUID(), kind, text: line, createdAt: Date.now() }))

    set((state) => ({
      terminalEntries: [...state.terminalEntries, ...entries].slice(-MAX_TERMINAL_ENTRIES),
    }))
  },

  clearTerminal: () => set({ terminalEntries: [] }),

  addHistory: (command) => {
    set((state) => ({ history: [...state.history.filter((item) => item !== command), command].slice(-50) }))
  },
}))
