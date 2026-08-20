const MAX_COMMAND_LENGTH = 20_000
const MAX_REMOTE_FILES = 8

export interface WorkspaceQueryBootstrap {
  command: string
  remoteUrls: URL[]
}

export interface WorkspaceQueryBootstrapResult {
  addedFiles: number
  failedUrls: URL[]
}

interface WorkspaceQueryBootstrapDependencies {
  addUploads: (files: File[]) => void
  fetch?: typeof fetch
  onError?: (message: string) => void
}

/**
 * Initial-page query contract:
 *   ?command=ffmpeg...&file=https://example.com/input.mp4&file=https://example.com/audio.wav
 *
 * `file` is repeatable, order-preserving, HTTPS-only, and capped to keep an
 * accidental shared link from starting an unbounded set of downloads.
 */
export function parseWorkspaceQuery(search: string): WorkspaceQueryBootstrap {
  const params = new URLSearchParams(search)
  const rawCommand = params.get("command") ?? ""
  const command = rawCommand.length <= MAX_COMMAND_LENGTH ? rawCommand : ""
  const remoteUrls: URL[] = []
  const seenUrls = new Set<string>()

  for (const value of params.getAll("file")) {
    if (remoteUrls.length >= MAX_REMOTE_FILES) break

    try {
      const url = new URL(value)
      if (url.protocol !== "https:" || url.username || url.password) continue

      url.hash = ""
      if (seenUrls.has(url.href)) continue
      seenUrls.add(url.href)
      remoteUrls.push(url)
    } catch {
      // Ignore malformed and relative URLs. The bootstrap contract is remote HTTPS only.
    }
  }

  return { command, remoteUrls }
}

function filenameFromUrl(url: URL, index: number) {
  const encodedName = url.pathname.split("/").filter(Boolean).at(-1)
  let name = encodedName

  if (encodedName) {
    try {
      name = decodeURIComponent(encodedName)
    } catch {
      // Keep a valid-but-unescaped path segment as-is.
    }
  }

  const sanitized = name?.replaceAll(/[/\\\0]/g, "_").trim()
  return sanitized || `remote-file-${index + 1}`
}

async function fetchRemoteFile(url: URL, index: number, fetchImplementation: typeof fetch) {
  const response = await fetchImplementation(url.href)
  if (!response.ok) throw new Error(`The remote server returned ${response.status}.`)

  const blob = await response.blob()
  return new File([blob], filenameFromUrl(url, index), {
    type: blob.type || response.headers.get("content-type") || "application/octet-stream",
    lastModified: Date.now(),
  })
}

/**
 * Creates a once-per-page bootstrap runner. React Strict Mode may replay the
 * mounting effect, but both calls receive the same promise and perform one import.
 */
export function createWorkspaceQueryBootstrap() {
  let started: Promise<WorkspaceQueryBootstrapResult> | null = null

  return {
    run(config: WorkspaceQueryBootstrap, dependencies: WorkspaceQueryBootstrapDependencies) {
      if (started) return started

      started = (async () => {
        const fetchImplementation = dependencies.fetch ?? fetch
        const imports = await Promise.allSettled(
          config.remoteUrls.map((url, index) => fetchRemoteFile(url, index, fetchImplementation)),
        )
        const files: File[] = []
        const failedUrls: URL[] = []

        imports.forEach((result, index) => {
          if (result.status === "fulfilled") {
            files.push(result.value)
            return
          }

          const url = config.remoteUrls[index]
          if (!url) return
          failedUrls.push(url)
          const reason =
            result.reason instanceof TypeError
              ? "The browser could not download it. The host must allow cross-origin requests (CORS)."
              : result.reason instanceof Error
                ? result.reason.message
                : "Unknown download error."
          dependencies.onError?.(`Could not add ${filenameFromUrl(url, index)}: ${reason}`)
        })

        if (files.length > 0) dependencies.addUploads(files)
        return { addedFiles: files.length, failedUrls }
      })()

      return started
    },
  }
}

export const workspaceQueryBootstrap = createWorkspaceQueryBootstrap()
