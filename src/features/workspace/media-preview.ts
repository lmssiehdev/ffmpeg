import type { WorkspaceAsset } from "@/features/workspace/types"

export type MediaPreviewKind = "image" | "video" | "audio" | "unsupported"

export function getMediaPreviewKind(asset: Pick<WorkspaceAsset, "type" | "status">): MediaPreviewKind {
  if (asset.status !== "ready") return "unsupported"
  if (asset.type.startsWith("image/")) return "image"
  if (asset.type.startsWith("video/")) return "video"
  if (asset.type.startsWith("audio/")) return "audio"
  return "unsupported"
}

export function isVisualPreview(kind: MediaPreviewKind) {
  return kind === "image" || kind === "video"
}
