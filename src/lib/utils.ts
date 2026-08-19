import { clsx, type ClassValue } from "clsx"
import { filesize } from "filesize"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number) {
  return filesize(bytes, { standard: "jedec", round: 1 })
}

export function inferMimeType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase()
  const mimeTypes = new Map([
    ["mp4", "video/mp4"],
    ["webm", "video/webm"],
    ["mov", "video/quicktime"],
    ["mkv", "video/x-matroska"],
    ["mp3", "audio/mpeg"],
    ["wav", "audio/wav"],
    ["ogg", "audio/ogg"],
    ["flac", "audio/flac"],
    ["m4a", "audio/mp4"],
    ["aac", "audio/aac"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["gif", "image/gif"],
    ["avif", "image/avif"],
    ["svg", "image/svg+xml"],
    ["heic", "image/heic"],
    ["srt", "application/x-subrip"],
    ["vtt", "text/vtt"],
    ["txt", "text/plain"],
    ["json", "application/json"],
  ])

  return extension ? (mimeTypes.get(extension) ?? "application/octet-stream") : "application/octet-stream"
}
