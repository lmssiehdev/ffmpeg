# FFmpeg Workspace

FFmpeg Workspace is a browser-based media toolkit for converting and exporting video, audio, images, subtitles, and related files. Processing runs on the user's device, so files do not need to be uploaded to use the workspace.

## Features

- Run FFmpeg commands from a browser-based terminal.
- Drag files into a local workspace and download generated outputs.
- Reference workspace files with `@` suggestions.
- Preview supported media and inspect files in list or grid view.
- Prefill a command and public image URLs through query parameters.
- Automate the workspace through the versioned browser API.

## Development

This project uses Astro, React, Tailwind CSS, and Bun.

```sh
bun install
bun run dev
```

The local site is available at `http://localhost:4321`.

Useful commands:

```sh
bun run check
bun run lint:ci
bun run test
bun run build
bun run preview
```

## Production metadata

Set `SITE_URL` to the deployed origin when building so canonical and social URLs are absolute:

```sh
SITE_URL=https://your-domain.example bun run build
```

The Open Graph image is committed as `public/og.png`. It is a static build asset; the image generator is not an application dependency.

## Shared workspace links

The page can prefill a command and fetch up to eight public HTTPS images:

```text
/?command=ffmpeg+-i+input.png+output.webp&file=https%3A%2F%2Fexample.com%2Finput.png
```

- `command` fills the terminal but never runs automatically.
- Repeat `file` for multiple images. The image host does not need to allow browser CORS.
- The `/api/image` bridge verifies JPEG, PNG, GIF, WebP, and AVIF responses up to 10 MiB.
- Remote video, audio, subtitles, and other files must be added locally.

Browser automation can explicitly run commands through `window.ffmpegWorkspace`. See [AGENT_API.md](./AGENT_API.md)
for the versioned API and a Bun WebView example. Machine-readable product documentation begins at `/llms.txt`.

## FFmpeg core loading

The pinned FFmpeg core is about 31 MiB and already uses one-year immutable HTTP caching. After the first usable file is
added, the app prepares it in the background on suitable connections so the first command can reuse that work. Save-Data,
2G, offline, and hidden-page sessions keep on-demand loading instead.

## Deployment

Build and deploy with Wrangler:

```sh
SITE_URL=https://your-domain.example bun run deploy
```
