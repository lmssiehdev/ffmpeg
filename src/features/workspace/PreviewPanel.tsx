import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileQuestion,
  Music2,
  RefreshCw,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getMediaPreviewKind } from "@/features/workspace/media-preview"
import { useWorkspaceStore } from "@/features/workspace/store"
import type { WorkspaceAsset } from "@/features/workspace/types"
import { formatBytes } from "@/lib/utils"

function PreviewFallback({ asset, decodeFailed = false }: { asset: WorkspaceAsset; decodeFailed?: boolean }) {
  const retryAsset = useWorkspaceStore((state) => state.retryAsset)
  const isError = asset.status === "error"

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 text-center text-muted-foreground">
      <div className="mb-3 flex size-12 items-center justify-center rounded-xl border bg-background shadow-xs">
        {isError ? <AlertTriangle className="size-5 text-destructive" /> : <FileQuestion className="size-5" />}
      </div>
      <p className="text-sm font-medium text-foreground">
        {isError ? "File unavailable" : decodeFailed ? "This browser can’t decode this preview" : "No browser preview"}
      </p>
      <p className="mt-1 text-xs leading-5">
        {isError
          ? asset.error
          : `${asset.type || "Unknown file type"} can still be used in terminal and FFmpeg commands.`}
      </p>
      {isError && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => retryAsset(asset.id)}>
          <RefreshCw data-icon="inline-start" />
          Retry
        </Button>
      )}
    </div>
  )
}

function InlinePreview({ asset, onOpenImage }: { asset: WorkspaceAsset; onOpenImage: () => void }) {
  const [decodeFailed, setDecodeFailed] = useState(false)
  const kind = getMediaPreviewKind(asset)

  useEffect(() => setDecodeFailed(false), [asset.id, asset.objectUrl])

  if (asset.status === "error") return <PreviewFallback asset={asset} />
  if (decodeFailed) return <PreviewFallback asset={asset} decodeFailed />

  if (kind === "image") {
    return (
      <button
        type="button"
        className="group absolute inset-0 flex cursor-zoom-in items-center justify-center p-3 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:p-4"
        onClick={onOpenImage}
        aria-label={`Open ${asset.name} in full-screen preview`}
      >
        <img
          key={asset.objectUrl}
          className="block max-h-full max-w-full rounded-lg object-contain shadow-sm outline outline-black/10 dark:outline-white/10"
          src={asset.objectUrl}
          alt=""
          onError={() => setDecodeFailed(true)}
        />
        <span className="pointer-events-none absolute bottom-3 end-3 rounded-md border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          Open preview
        </span>
      </button>
    )
  }

  if (kind === "video") {
    return (
      <video
        key={asset.objectUrl}
        className="block size-full min-h-0 object-contain p-3 sm:p-4"
        src={asset.objectUrl}
        controls
        preload="metadata"
        aria-label={`Video preview of ${asset.name}`}
        onError={() => setDecodeFailed(true)}
      />
    )
  }

  if (kind === "audio") {
    return (
      <div className="w-full max-w-xl space-y-4 px-6 text-center">
        <Music2 className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <audio
          key={asset.objectUrl}
          className="w-full"
          src={asset.objectUrl}
          controls
          preload="metadata"
          aria-label={`Audio preview of ${asset.name}`}
          onError={() => setDecodeFailed(true)}
        />
      </div>
    )
  }

  return <PreviewFallback asset={asset} />
}

export function PreviewPanel() {
  const assets = useWorkspaceStore((state) => state.assets)
  const selectedAssetId = useWorkspaceStore((state) => state.selectedAssetId)
  const selectAsset = useWorkspaceStore((state) => state.selectAsset)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const selectedIndex = assets.findIndex((candidate) => candidate.id === selectedAssetId)
  const asset = assets[selectedIndex]
  const imageAssets = assets.filter(
    (candidate) => candidate.status === "ready" && getMediaPreviewKind(candidate) === "image",
  )
  const lightboxIndex = asset ? imageAssets.findIndex((candidate) => candidate.id === asset.id) : -1

  const selectAt = (index: number) => {
    const target = assets[index]
    if (target) selectAsset(target.id)
  }

  const selectImageAt = (index: number) => {
    const target = imageAssets[index]
    if (target) selectAsset(target.id)
  }

  if (!asset) {
    return (
      <section className="flex min-h-52 items-center justify-center rounded-xl border bg-card p-8 text-center">
        <div className="space-y-2">
          <FileQuestion className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-medium">No file selected</h2>
          <p className="text-sm text-muted-foreground">Choose a file to inspect or preview it here.</p>
        </div>
      </section>
    )
  }

  const isImage = getMediaPreviewKind(asset) === "image"

  return (
    <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
      <section className="flex min-h-52 flex-col overflow-hidden rounded-xl border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1 basis-44">
            <h2 className="truncate text-sm font-medium">{asset.name}</h2>
            <p className="text-xs text-muted-foreground">{formatBytes(asset.size)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 sm:size-7"
              aria-label="Previous file"
              disabled={selectedIndex <= 0}
              onClick={() => selectAt(selectedIndex - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-10 text-center text-[11px] tabular-nums text-muted-foreground">
              {selectedIndex + 1} / {assets.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 sm:size-7"
              aria-label="Next file"
              disabled={selectedIndex >= assets.length - 1}
              onClick={() => selectAt(selectedIndex + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {asset.source}
          </Badge>
          {isImage && asset.status === "ready" && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 sm:size-7"
              aria-label={`Expand preview of ${asset.name}`}
              onClick={() => setLightboxOpen(true)}
            >
              <Expand />
            </Button>
          )}
          <Button
            render={<a href={asset.objectUrl} download={asset.name} aria-label={`Download ${asset.name}`} />}
            nativeButton={false}
            variant="outline"
            size="sm"
            className="size-9 px-0 sm:h-7 sm:w-auto sm:px-2.5"
          >
            <Download data-icon="inline-start" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </header>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30">
          <InlinePreview asset={asset} onOpenImage={() => setLightboxOpen(true)} />
        </div>
      </section>

      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/75 supports-backdrop-filter:backdrop-blur-sm"
        className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl bg-background p-0 text-foreground sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:max-w-none"
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
          if (event.key === "ArrowLeft" && lightboxIndex > 0) {
            event.preventDefault()
            selectImageAt(lightboxIndex - 1)
          }
          if (event.key === "ArrowRight" && lightboxIndex < imageAssets.length - 1) {
            event.preventDefault()
            selectImageAt(lightboxIndex + 1)
          }
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm">{asset.name}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {formatBytes(asset.size)} · Image {lightboxIndex + 1} of {imageAssets.length}
            </DialogDescription>
          </div>
          <Button
            render={<a href={asset.objectUrl} download={asset.name} aria-label={`Download ${asset.name}`} />}
            nativeButton={false}
            variant="ghost"
            size="icon-sm"
            className="size-10 sm:size-7"
          >
            <Download />
          </Button>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" className="size-10 sm:size-7" aria-label="Close preview" />}
          >
            <X />
          </DialogClose>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black/95 p-3 sm:p-6">
          <img key={asset.objectUrl} className="size-full object-contain" src={asset.objectUrl} alt={asset.name} />
          {imageAssets.length > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute start-3 top-1/2 size-10 -translate-y-1/2 rounded-full shadow-lg sm:start-5"
                aria-label="Previous image"
                disabled={lightboxIndex <= 0}
                onClick={() => selectImageAt(lightboxIndex - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute end-3 top-1/2 size-10 -translate-y-1/2 rounded-full shadow-lg sm:end-5"
                aria-label="Next image"
                disabled={lightboxIndex >= imageAssets.length - 1}
                onClick={() => selectImageAt(lightboxIndex + 1)}
              >
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          Image {lightboxIndex + 1} of {imageAssets.length}: {asset.name}
        </p>
      </DialogContent>
    </Dialog>
  )
}
