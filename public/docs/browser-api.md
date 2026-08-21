# Browser automation API

The React application installs a frozen, versioned `window.ffmpegWorkspace` object. It is designed for Bun WebView, Playwright, and other browser automation. FFmpeg runs inside that browser page, not on the Astro or Cloudflare server.

## Methods

- `ready()` waits for shared-link bootstrap and returns current status.
- `status()` reports readiness, command activity, and the active request ID.
- `run({ requestId, command })` explicitly runs one command and returns structured stdout, stderr, exit code, and output metadata.
- `cancel(requestId?)` cancels the matching active command.
- `listFiles()` returns JSON-safe workspace file metadata.
- `readFileChunk({ fileId, offset, maxBytes })` returns an output chunk as base64. Chunks are capped at 1 MiB.

Only one command runs at a time. A unique `requestId` makes retries idempotent: repeating the same ID returns its original promise/result instead of executing twice. Opening a page, calling `ready()`, or supplying query parameters never runs a command.

See the [source API guide](https://github.com/lmssiehdev/ffmpeg/blob/main/AGENT_API.md) for a complete Bun WebView example.
