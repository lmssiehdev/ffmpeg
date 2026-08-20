# FFmpeg Workspace

FFmpeg Workspace is a browser-based media toolkit for converting and exporting video, audio, images, subtitles, and related files. Processing runs on the user's device, so files do not need to be uploaded to use the workspace.

## Features

- Run FFmpeg commands from a browser-based terminal.
- Drag files into a local workspace and download generated outputs.
- Reference workspace files with `@` suggestions.
- Preview supported media and inspect files in list or grid view.
- Prefill a command and remote file URLs through query parameters.

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

The page can prefill a command and fetch up to eight HTTPS files:

```text
/?command=ffmpeg+-i+input.mp4+output.webm&file=https%3A%2F%2Fexample.com%2Finput.mp4
```

- `command` fills the terminal but never runs automatically.
- Repeat `file` for multiple remote files.
- Remote hosts must allow browser access through CORS.

## Deployment

Build and deploy with Wrangler:

```sh
SITE_URL=https://your-domain.example bun run deploy
```
