import { useWorkspaceStore } from "@/features/workspace/store"
import { ffmpegEngine } from "@/lib/ffmpeg/engine"

const FFMPEG_CDN_ORIGIN = "https://cdn.jsdelivr.net"

interface WarmupEnvironment {
  hidden: boolean
  online: boolean
  saveData: boolean
  effectiveType?: string
}

interface NavigatorConnection {
  saveData?: boolean
  effectiveType?: string
}

let warmupPromise: Promise<void> | null = null
let warmupAttempt = 0
let visibilityListenerInstalled = false

export function canAutomaticallyPrepareFfmpeg(environment: WarmupEnvironment) {
  return (
    !environment.hidden &&
    environment.online &&
    !environment.saveData &&
    environment.effectiveType !== "slow-2g" &&
    environment.effectiveType !== "2g"
  )
}

function currentEnvironment(): WarmupEnvironment {
  // SAFETY: Network Information is an optional browser API, so the property may be absent at runtime.
  const connection = (navigator as Navigator & { connection?: NavigatorConnection }).connection
  return {
    hidden: document.hidden,
    online: navigator.onLine,
    saveData: connection?.saveData ?? false,
    effectiveType: connection?.effectiveType,
  }
}

export function hintFfmpegDownload() {
  if (document.head.querySelector(`link[data-ffmpeg-preconnect="${FFMPEG_CDN_ORIGIN}"]`)) return

  const link = document.createElement("link")
  link.rel = "preconnect"
  link.href = FFMPEG_CDN_ORIGIN
  link.crossOrigin = "anonymous"
  link.dataset.ffmpegPreconnect = FFMPEG_CDN_ORIGIN
  document.head.append(link)
}

export function prepareFfmpeg() {
  if (ffmpegEngine.loaded) {
    useWorkspaceStore.getState().setEnginePreparation("ready")
    return Promise.resolve()
  }
  if (warmupPromise) return warmupPromise

  const attempt = ++warmupAttempt
  const store = useWorkspaceStore.getState()
  hintFfmpegDownload()
  store.setEnginePreparation("preparing")
  store.setCommandAnnouncement("Preparing FFmpeg in the background.")

  warmupPromise = ffmpegEngine
    .preload()
    .then(() => {
      if (attempt !== warmupAttempt) return
      const currentStore = useWorkspaceStore.getState()
      currentStore.setEnginePreparation("ready")
      currentStore.setCommandAnnouncement("FFmpeg is ready.")
    })
    .catch((error) => {
      if (attempt !== warmupAttempt) return
      const message = error instanceof Error ? error.message : String(error)
      const currentStore = useWorkspaceStore.getState()
      currentStore.setEnginePreparation("error", message)
      currentStore.setCommandAnnouncement("FFmpeg couldn’t load. Check your connection and try again.")
      throw error
    })
    .finally(() => {
      if (attempt === warmupAttempt) warmupPromise = null
    })

  return warmupPromise
}

export function scheduleFfmpegPreparation() {
  if (ffmpegEngine.loaded || warmupPromise) return
  const environment = currentEnvironment()

  if (environment.hidden) {
    if (visibilityListenerInstalled) return
    visibilityListenerInstalled = true
    document.addEventListener(
      "visibilitychange",
      () => {
        visibilityListenerInstalled = false
        scheduleFfmpegPreparation()
      },
      { once: true },
    )
    return
  }

  if (!canAutomaticallyPrepareFfmpeg(environment)) return
  void prepareFfmpeg().catch(() => {
    // Background preparation is opportunistic. The visible retry action and
    // the next FFmpeg command can attempt the load again.
  })
}

export function resetFfmpegPreparation() {
  warmupAttempt += 1
  warmupPromise = null
  useWorkspaceStore.getState().setEnginePreparation("unloaded")
}
