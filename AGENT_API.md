# Browser agent API

The workspace exposes a versioned `window.ffmpegWorkspace` API after the React app mounts. It is intended for browser
automation such as `Bun.WebView` or Playwright. FFmpeg still runs locally inside the opened browser page; no media is
processed or stored by the Astro server.

Query parameters prepare a workspace without executing it:

```text
/?file=https%3A%2F%2Fimages.example.com%2Finput.png&command=ffmpeg%20-i%20'.%2Finput.png'%20output.webp
```

- `file` is repeatable and imports public HTTPS images through `/api/image`.
- `command` fills the visible terminal draft.
- Opening a link never runs its command automatically. An agent must explicitly call `run()`.

## API contract

```ts
window.ffmpegWorkspace.version // 1

await window.ffmpegWorkspace.ready()
window.ffmpegWorkspace.status()
window.ffmpegWorkspace.listFiles()

await window.ffmpegWorkspace.run({
  requestId: "resize-001",
  command: "ffmpeg -i './input.png' -vf scale=640:-1 output.webp",
})

window.ffmpegWorkspace.cancel("resize-001")

await window.ffmpegWorkspace.readFileChunk({
  fileId: "workspace-asset-id",
  offset: 0,
  maxBytes: 262144,
})
```

`requestId` is required. Repeating the same ID returns the original promise/result instead of executing the command a
second time. The workspace runs one command at a time and returns a structured `BUSY` error for a different concurrent
request.

`listFiles()` and command results contain JSON-safe file metadata. `readFileChunk()` returns at most 1 MiB of base64 per
call, allowing automation runtimes to reconstruct outputs without attempting to serialize a browser `Blob`.

## Bun WebView example

```ts
const appUrl = new URL("https://your-domain.example/")
appUrl.searchParams.append("file", "https://images.example.com/input.png")
appUrl.searchParams.set("command", "ffmpeg -i './input.png' -vf scale=640:-1 output.webp")

await using view = new Bun.WebView({ backend: "chrome" })
await view.navigate(appUrl.href)

await view.evaluate(`new Promise((resolve) => {
  const ready = () => window.ffmpegWorkspace.ready().then(resolve)
  if (window.ffmpegWorkspace) ready()
  else window.addEventListener("ffmpeg-workspace-api-ready", ready, { once: true })
})`)

const request = {
  requestId: crypto.randomUUID(),
  command: "ffmpeg -i './input.png' -vf scale=640:-1 output.webp",
}
const result = await view.evaluate(`window.ffmpegWorkspace.run(${JSON.stringify(request)})`)

if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)

for (const output of result.value.outputs) {
  const chunks: Uint8Array[] = []
  let offset = 0
  let done = false

  while (!done) {
    const chunk = await view.evaluate(
      `window.ffmpegWorkspace.readFileChunk(${JSON.stringify({
        fileId: output.id,
        offset,
        maxBytes: 262144,
      })})`,
    )
    if (!chunk.ok) throw new Error(`${chunk.error.code}: ${chunk.error.message}`)

    chunks.push(Buffer.from(chunk.value.base64, "base64"))
    offset = chunk.value.nextOffset
    done = chunk.value.done
  }

  await Bun.write(output.name, new Blob(chunks, { type: output.type }))
}
```

Call WebView `evaluate()` operations serially. Bun permits only one evaluation at a time per view, and the chunk API is
designed around that constraint.
