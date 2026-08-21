import { ShieldCheck, Star } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkspaceMark } from "@/components/WorkspaceMark"
import { Terminal } from "@/features/terminal/Terminal"
import { UploadManager } from "@/features/uploads/UploadManager"
import { installFfmpegWorkspaceApi, markFfmpegWorkspaceBootstrapReady } from "@/features/workspace/browser-api"
import { PreviewPanel } from "@/features/workspace/PreviewPanel"
import { parseWorkspaceQuery, workspaceQueryBootstrap } from "@/features/workspace/query-bootstrap"
import { useWorkspaceStore } from "@/features/workspace/store"

export default function WorkspaceApp() {
  const [queryBootstrap] = useState(() => parseWorkspaceQuery(window.location.search))

  useEffect(() => {
    installFfmpegWorkspaceApi()
    const { addUploads, appendTerminal } = useWorkspaceStore.getState()

    void workspaceQueryBootstrap
      .run(queryBootstrap, {
        addUploads,
        onError: (message) => appendTerminal("stderr", message),
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Workspace link setup failed."
        appendTerminal("stderr", message)
      })
      .finally(markFfmpegWorkspaceBootstrapReady)
  }, [queryBootstrap])

  return (
    <TooltipProvider>
      <main className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
        <header className="shrink-0 border-b bg-card">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceMark className="size-7 shrink-0 text-foreground" />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">FFmpeg Workspace</h1>
                <p className="truncate text-xs text-muted-foreground">Convert media without uploading it</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge className="hidden sm:inline-flex" variant="outline">
                <ShieldCheck /> Files stay on your device
              </Badge>
              <Button
                render={
                  <a
                    href="https://github.com/lmssiehdev/ffmpeg"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Star FFmpeg Workspace on GitHub"
                  />
                }
                className="size-9 px-0 sm:h-7 sm:w-auto sm:px-2.5"
                size="sm"
                variant="outline"
              >
                <Star className="size-4" />
                <span className="hidden sm:inline">Star on GitHub</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(340px,0.85fr)_minmax(500px,1.15fr)] lg:overflow-hidden">
          <UploadManager />
          <div className="grid min-h-0 gap-4 lg:grid-rows-[minmax(220px,0.72fr)_minmax(340px,1fr)]">
            <PreviewPanel />
            <Terminal initialCommand={queryBootstrap.command} />
          </div>
        </div>

        <Separator />
        <footer className="shrink-0 px-4 py-2 text-center text-[11px] text-muted-foreground">
          Made with <span aria-hidden="true">&lt;3</span>
          <span className="sr-only">love</span> by{" "}
          <a
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            href="https://lmssieh.com"
          >
            lmssieh.com
          </a>
        </footer>
      </main>
    </TooltipProvider>
  )
}
