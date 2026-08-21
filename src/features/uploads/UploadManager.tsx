import {
  AudioLines,
  CheckCircle2,
  Download,
  File,
  FileImage,
  LayoutGrid,
  List,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react"
import { useRef, useState, type DragEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { hintFfmpegDownload } from "@/features/workspace/ffmpeg-warmup"
import { getMediaPreviewKind } from "@/features/workspace/media-preview"
import { useWorkspaceStore } from "@/features/workspace/store"
import type { WorkspaceAsset } from "@/features/workspace/types"
import { cn, formatBytes } from "@/lib/utils"

function AssetIcon({ type }: { type: string }) {
  if (type.startsWith("video/")) return <Video />
  if (type.startsWith("audio/")) return <AudioLines />
  if (type.startsWith("image/")) return <FileImage />
  return <File />
}

function AssetActions({ asset, floating = false }: { asset: WorkspaceAsset; floating?: boolean }) {
  const removeAsset = useWorkspaceStore((state) => state.removeAsset)
  const retryAsset = useWorkspaceStore((state) => state.retryAsset)

  return (
    <div className="flex items-center gap-0.5">
      {asset.status === "error" && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("size-9 sm:size-7", floating && "bg-background/90 shadow-sm backdrop-blur-sm")}
          aria-label={`Retry ${asset.name}`}
          onClick={() => retryAsset(asset.id)}
        >
          <RefreshCw />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("size-9 sm:size-7", floating && "bg-background/90 shadow-sm backdrop-blur-sm")}
              aria-label={`Actions for ${asset.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a href={asset.objectUrl} download={asset.name} />}>
            <Download />
            Download
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => removeAsset(asset.id)}>
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function AssetRow({ asset }: { asset: WorkspaceAsset }) {
  const selectedAssetId = useWorkspaceStore((state) => state.selectedAssetId)
  const selectAsset = useWorkspaceStore((state) => state.selectAsset)

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg border border-transparent p-1.5 transition-colors",
        selectedAssetId === asset.id ? "border-border bg-muted/70" : "hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={() => selectAsset(asset.id)}
        aria-pressed={selectedAssetId === asset.id}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-xs ring-1 ring-border/70 [&_svg]:size-4"
          aria-hidden="true"
        >
          <AssetIcon type={asset.type} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{asset.name}</span>
            {asset.source === "output" && (
              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                output
              </Badge>
            )}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <span>{formatBytes(asset.size)}</span>
            <span aria-hidden="true">·</span>
            {asset.status === "ready" ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
                Ready
              </span>
            ) : (
              <span className="min-w-0 break-words text-destructive">{asset.error}</span>
            )}
          </span>
        </span>
      </button>
      <AssetActions asset={asset} />
    </div>
  )
}

function AssetGridCard({ asset }: { asset: WorkspaceAsset }) {
  const selectedAssetId = useWorkspaceStore((state) => state.selectedAssetId)
  const selectAsset = useWorkspaceStore((state) => state.selectAsset)
  const isImage = getMediaPreviewKind(asset) === "image"

  return (
    <div
      className={cn(
        "group relative min-w-0 rounded-lg border bg-background p-1.5 transition-[color,background-color,border-color,box-shadow]",
        selectedAssetId === asset.id ? "border-foreground/25 bg-muted/60 shadow-xs" : "hover:border-border/80",
      )}
    >
      <button
        type="button"
        className="block w-full min-w-0 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={() => selectAsset(asset.id)}
        aria-pressed={selectedAssetId === asset.id}
      >
        <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground ring-1 ring-black/5 dark:ring-white/10">
          {isImage ? (
            <img className="size-full object-contain" src={asset.objectUrl} alt="" loading="lazy" />
          ) : (
            <span className="[&_svg]:size-6" aria-hidden="true">
              <AssetIcon type={asset.type} />
            </span>
          )}
        </span>
        <span className="block min-w-0 px-1 pb-1 pt-2">
          <span className="flex min-w-0 items-center gap-1.5 pe-7">
            <span className="truncate text-xs font-medium">{asset.name}</span>
            {asset.source === "output" && (
              <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">
                output
              </Badge>
            )}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-[10px] text-muted-foreground",
              asset.status === "error" && "text-destructive",
            )}
          >
            {formatBytes(asset.size)} · {asset.status === "ready" ? "Ready" : asset.error}
          </span>
        </span>
      </button>
      <div className="absolute end-2 top-2">
        <AssetActions asset={asset} floating />
      </div>
    </div>
  )
}

export function UploadManager() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [view, setView] = useState<"list" | "grid">("list")
  const assets = useWorkspaceStore((state) => state.assets)
  const addUploads = useWorkspaceStore((state) => state.addUploads)
  const readyAssets = assets.filter((asset) => asset.status === "ready")
  const outputCount = assets.filter((asset) => asset.source === "output").length
  const totalSize = readyAssets.reduce((total, asset) => total + asset.size, 0)
  const errorCount = assets.filter((asset) => asset.status === "error").length

  const receiveFiles = (files: FileList | null) => {
    if (!files?.length) return
    addUploads(Array.from(files))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    receiveFiles(event.dataTransfer.files)
  }

  return (
    <section className="flex h-[34rem] min-h-0 flex-col overflow-hidden rounded-xl border bg-card lg:h-auto">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Workspace files</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>Stored on this device</span>
            <span aria-hidden="true">·</span>
            <span>
              {readyAssets.length} {readyAssets.length === 1 ? "file" : "files"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatBytes(totalSize)}</span>
            {outputCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {outputCount} {outputCount === 1 ? "output" : "outputs"}
                </span>
              </>
            )}
            {errorCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-destructive">{errorCount} failed</span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 sm:h-7"
          onPointerDown={hintFfmpegDownload}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud data-icon="inline-start" />
          Add files
        </Button>
      </header>

      <input
        ref={inputRef}
        hidden
        type="file"
        multiple
        onChange={(event) => {
          receiveFiles(event.target.files)
          event.target.value = ""
        }}
      />

      <div className="mx-3 mt-3 sm:mx-4 sm:mt-4">
        <div
          className={cn(
            "flex min-h-20 items-center gap-2.5 rounded-lg border border-dashed px-3 py-3 text-start transition-colors",
            isDragging ? "border-primary bg-primary/5" : "bg-muted/25 hover:bg-muted/40",
          )}
          onDragEnter={(event) => {
            event.preventDefault()
            hintFfmpegDownload()
            setIsDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            const relatedTarget = event.relatedTarget
            if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setIsDragging(false)
          }}
          onDrop={handleDrop}
        >
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs"
            aria-hidden="true"
          >
            <UploadCloud className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Drop media here</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Media and related files · 512 MB/file · 768 MB total
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 sm:h-7"
            onPointerDown={hintFfmpegDownload}
            onClick={() => inputRef.current?.click()}
          >
            Browse
          </Button>
        </div>
      </div>

      <div className="mx-3 mb-3 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/10 sm:mx-4 sm:mb-4">
        <div className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
          <h3 className="text-xs font-medium">Files in workspace</h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {assets.length} {assets.length === 1 ? "item" : "items"}
            </span>
            <div
              className="flex items-center rounded-md border bg-background p-0.5"
              role="group"
              aria-label="Workspace file view"
            >
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid />
              </Button>
            </div>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1 p-1.5">
          {assets.length > 0 ? (
            <div className="@container">
              {view === "list" ? (
                <div className="space-y-1">
                  {assets.map((asset) => (
                    <AssetRow key={asset.id} asset={asset} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5 @min-[24rem]:grid-cols-2">
                  {assets.map((asset) => (
                    <AssetGridCard key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-20 items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Uploaded files and generated outputs appear here.
            </div>
          )}
        </ScrollArea>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {readyAssets.length} {readyAssets.length === 1 ? "file" : "files"} ready, {errorCount} failed, {outputCount}{" "}
        {outputCount === 1 ? "output" : "outputs"}.
      </p>
    </section>
  )
}
