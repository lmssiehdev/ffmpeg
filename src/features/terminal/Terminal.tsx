import { CircleStop, CornerDownLeft, LoaderCircle, TerminalSquare } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"
import { ZodError } from "zod"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileMentionInput } from "@/features/terminal/FileMentionInput"
import { completeFilename, executeShellCommand } from "@/features/terminal/shell"
import { useWorkspaceStore } from "@/features/workspace/store"
import { ffmpegEngine, type EngineTimings } from "@/lib/ffmpeg/engine"
import { cn } from "@/lib/utils"

function formatDuration(milliseconds: number) {
  if (milliseconds < 1) return "<1ms"
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`
}

function formatTimings(timings: EngineTimings) {
  return [
    `Completed in ${formatDuration(timings.totalMs)}`,
    `load ${formatDuration(timings.loadMs)}`,
    `prepare ${formatDuration(timings.prepareMs)}`,
    `FFmpeg ${formatDuration(timings.executeMs)}`,
    `collect ${formatDuration(timings.collectMs)}`,
  ].join(" · ")
}

export function Terminal({ initialCommand = "" }: { initialCommand?: string }) {
  const [command, setCommand] = useState(initialCommand)
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState("Terminal ready.")
  const [isExecuting, setIsExecuting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const lastScrolledEntryIdRef = useRef(useWorkspaceStore.getState().terminalEntries.at(-1)?.id)
  const logBufferRef = useRef<string[]>([])

  const assets = useWorkspaceStore((state) => state.assets)
  const entries = useWorkspaceStore((state) => state.terminalEntries)
  const history = useWorkspaceStore((state) => state.history)
  const engineStatus = useWorkspaceStore((state) => state.engineStatus)
  const engineProgress = useWorkspaceStore((state) => state.engineProgress)
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal)
  const clearTerminal = useWorkspaceStore((state) => state.clearTerminal)
  const addHistory = useWorkspaceStore((state) => state.addHistory)
  const setEngine = useWorkspaceStore((state) => state.setEngine)
  const upsertOutput = useWorkspaceStore((state) => state.upsertOutput)

  const engineBusy = engineStatus === "loading" || engineStatus === "running"
  const isBusy = isExecuting || engineBusy
  const readyAssets = useMemo(() => assets.filter((asset) => asset.status === "ready"), [assets])

  useEffect(() => {
    const lastEntryId = entries.at(-1)?.id
    if (!lastEntryId || lastEntryId === lastScrolledEntryIdRef.current) return

    lastScrolledEntryIdRef.current = lastEntryId
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" })
  }, [entries])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      ffmpegEngine.cancel()
    }
  }, [])

  const flushLogs = () => {
    const batch = logBufferRef.current.splice(0)
    if (!batch.length) return
    appendTerminal("log", batch.join("\n"))
  }

  const runFfmpeg = async (args: string[], signal?: AbortSignal) => {
    const flushTimer = window.setInterval(flushLogs, 150)

    try {
      const result = await ffmpegEngine.run(
        args,
        readyAssets,
        {
          onPhase: (phase) => {
            setEngine(phase, phase === "running" ? 0 : null)
            setAnnouncement(phase === "loading" ? "Loading FFmpeg." : "FFmpeg command running.")
          },
          onLog: (_type, message) => {
            logBufferRef.current.push(message)
            if (logBufferRef.current.length > 200) flushLogs()
          },
          onProgress: (progress) => setEngine("running", progress),
        },
        signal,
      )

      for (const output of result.outputs) upsertOutput(output.name, output.blob)
      flushLogs()
      appendTerminal("system", formatTimings(result.timings))
      setEngine(
        result.exitCode === 0 ? "ready" : "error",
        null,
        result.exitCode === 0 ? null : `FFmpeg exited with code ${result.exitCode}.`,
      )
      setAnnouncement(
        result.exitCode === 0
          ? `FFmpeg command completed${result.outputs.length ? ` with ${result.outputs.length} output${result.outputs.length === 1 ? "" : "s"}` : ""}.`
          : `FFmpeg command failed with exit code ${result.exitCode}.`,
      )

      return { exitCode: result.exitCode, outputNames: result.outputs.map((output) => output.name) }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
      const message = error instanceof Error ? error.message : "FFmpeg failed unexpectedly."
      appendTerminal("stderr", message)
      setEngine("error", null, message)
      setAnnouncement(`FFmpeg command failed: ${message}`)
      return { exitCode: 1, outputNames: [] }
    } finally {
      window.clearInterval(flushTimer)
      flushLogs()
    }
  }

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const script = command.trim()
    if (!script || isBusy || abortRef.current) return

    if (script === "clear") {
      clearTerminal()
      setCommand("")
      return
    }

    appendTerminal("command", script)
    setAnnouncement("Command running.")
    addHistory(script)
    setCommand("")
    setHistoryIndex(null)
    const controller = new AbortController()
    abortRef.current = controller
    setIsExecuting(true)

    try {
      const result = await executeShellCommand(script, readyAssets, { runFfmpeg }, controller.signal)
      if (result.stdout) appendTerminal("stdout", result.stdout)
      if (result.stderr) appendTerminal("stderr", result.stderr)
      if (!script.startsWith("ffmpeg")) {
        setAnnouncement(
          result.exitCode === 0 ? "Command completed." : `Command failed with exit code ${result.exitCode}.`,
        )
      }
    } catch (error) {
      if (error instanceof ZodError) {
        appendTerminal("stderr", "Command must be between 1 and 20,000 characters.")
        setAnnouncement("Command rejected. It must be between 1 and 20,000 characters.")
      } else if (error instanceof DOMException && error.name === "AbortError") {
        appendTerminal("system", "Command cancelled.")
        setAnnouncement("Command cancelled.")
      } else {
        const message = error instanceof Error ? error.message : "Shell command failed."
        appendTerminal("stderr", message)
        setAnnouncement(`Command failed: ${message}`)
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsExecuting(false)
      if (useWorkspaceStore.getState().engineStatus === "running") setEngine("ready", null)
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    ffmpegEngine.cancel()
    setEngine("idle", null)
    appendTerminal("system", "FFmpeg worker terminated. It will reload on the next command.")
    setAnnouncement("FFmpeg command cancelled.")
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return

    if (event.key === "Tab" && !event.shiftKey) {
      const completed = completeFilename(command, readyAssets)
      if (completed !== command) {
        event.preventDefault()
        setCommand(completed)
        setHistoryIndex(null)
      }
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (!history.length) return
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setCommand(history[nextIndex] ?? "")
    }

    if (event.key === "ArrowDown" && historyIndex !== null) {
      event.preventDefault()
      const nextIndex = historyIndex + 1
      if (nextIndex >= history.length) {
        setHistoryIndex(null)
        setCommand("")
      } else {
        setHistoryIndex(nextIndex)
        setCommand(history[nextIndex] ?? "")
      }
    }
  }

  return (
    <section className="flex h-[32rem] min-h-80 flex-col overflow-hidden rounded-xl border bg-card lg:h-auto">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <TerminalSquare className="size-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">Terminal</h2>
            <p className="text-xs text-muted-foreground">just-bash + ffmpeg.wasm</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {isBusy && <LoaderCircle className="animate-spin motion-reduce:animate-none" />}
            {engineStatus}
          </Badge>
          {isBusy && (
            <Button variant="outline" size="sm" onClick={cancel}>
              <CircleStop data-icon="inline-start" />
              Stop
            </Button>
          )}
        </div>
      </header>

      {engineProgress !== null && isBusy && (
        <Progress value={engineProgress * 100} className="rounded-none" aria-label="Estimated FFmpeg progress" />
      )}

      <ScrollArea className="min-h-0 flex-1 bg-muted/20">
        <div
          className="min-h-full space-y-1 p-4 font-mono text-xs leading-relaxed"
          role="log"
          aria-label="Terminal output"
          aria-busy={isBusy}
        >
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "break-words whitespace-pre-wrap",
                entry.kind === "command" &&
                  "font-medium text-foreground before:mr-2 before:text-muted-foreground before:content-['$']",
                entry.kind === "stderr" && "text-destructive",
                (entry.kind === "stdout" || entry.kind === "system" || entry.kind === "log") && "text-muted-foreground",
              )}
            >
              {entry.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form
        className="flex items-center gap-2 border-t p-3 focus-within:ring-3 focus-within:ring-ring/50"
        onSubmit={submit}
      >
        <span className="select-none font-mono text-sm text-muted-foreground" aria-hidden="true">
          $
        </span>
        <FileMentionInput
          className="min-w-0 flex-1 bg-transparent font-mono text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          value={command}
          onValueChange={(value) => {
            setCommand(value)
            setHistoryIndex(null)
          }}
          readyAssets={readyAssets}
          onKeyDown={handleKeyDown}
          placeholder={
            readyAssets.length
              ? `ffmpeg -i ${readyAssets[0]?.name ?? "input.mp4"} output.mp3`
              : "Add a file or run echo hello"
          }
          autoComplete="off"
          spellCheck={false}
          disabled={isBusy}
          aria-label="Terminal command"
        />
        <Button size="icon-sm" type="submit" disabled={!command.trim() || isBusy} aria-label="Run command">
          <CornerDownLeft />
        </Button>
      </form>
      <footer className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        @ picks a workspace file · Tab completes a unique filename · ↑/↓ command history · Bash loops/globs supported ·
        FFmpeg media pipes unsupported
      </footer>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
