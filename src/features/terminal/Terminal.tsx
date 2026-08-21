import { CircleStop, CornerDownLeft, LoaderCircle, TerminalSquare } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { workspaceCommandRunner } from "@/features/terminal/command-runner"
import { FileMentionInput } from "@/features/terminal/FileMentionInput"
import { completeFilename } from "@/features/terminal/shell"
import { useWorkspaceStore } from "@/features/workspace/store"
import { cn } from "@/lib/utils"

export function Terminal({ initialCommand = "" }: { initialCommand?: string }) {
  const [command, setCommand] = useState(initialCommand)
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const lastScrolledEntryIdRef = useRef(useWorkspaceStore.getState().terminalEntries.at(-1)?.id)

  const assets = useWorkspaceStore((state) => state.assets)
  const entries = useWorkspaceStore((state) => state.terminalEntries)
  const history = useWorkspaceStore((state) => state.history)
  const engineStatus = useWorkspaceStore((state) => state.engineStatus)
  const engineProgress = useWorkspaceStore((state) => state.engineProgress)
  const commandRunning = useWorkspaceStore((state) => state.commandRunning)
  const commandAnnouncement = useWorkspaceStore((state) => state.commandAnnouncement)
  const clearTerminal = useWorkspaceStore((state) => state.clearTerminal)

  const isBusy = commandRunning
  const displayedStatus = isBusy && (engineStatus === "idle" || engineStatus === "ready") ? "running" : engineStatus
  const readyAssets = useMemo(() => assets.filter((asset) => asset.status === "ready"), [assets])

  useEffect(() => {
    const lastEntryId = entries.at(-1)?.id
    if (!lastEntryId || lastEntryId === lastScrolledEntryIdRef.current) return

    lastScrolledEntryIdRef.current = lastEntryId
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" })
  }, [entries])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const script = command.trim()
    if (!script || isBusy) return

    if (script === "clear") {
      clearTerminal()
      setCommand("")
      return
    }

    let execution: ReturnType<typeof workspaceCommandRunner.run>
    try {
      execution = workspaceCommandRunner.run(script, { source: "user" })
    } catch {
      return
    }

    setCommand("")
    setHistoryIndex(null)
    try {
      await execution
    } catch {
      // The shared runner records and announces command failures.
    }
  }

  const cancel = () => {
    workspaceCommandRunner.cancel()
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
            <p className="text-xs text-muted-foreground">Run FFmpeg commands</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {isBusy && <LoaderCircle className="animate-spin motion-reduce:animate-none" />}
            {displayedStatus}
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
        {commandAnnouncement}
      </p>
    </section>
  )
}
