# Cloudflare deployment

The Astro site is statically generated and deployed with Cloudflare Workers Static Assets. FFmpeg execution remains entirely in the browser.

The pinned FFmpeg core is loaded at runtime from jsDelivr:

```text
https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js
https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm
```

Keeping the 31 MiB WASM binary on the package CDN avoids Cloudflare's 25 MiB per-static-asset limit. When changing the core version, update the pinned URL in `src/lib/ffmpeg/engine.ts` and verify the new files before deployment.

## Deploy

```sh
bunx wrangler login
bun run deploy
```

The deploy script builds the static Astro site and publishes `dist` with `wrangler deploy`.

## Local Cloudflare preview

```sh
bun run cloudflare:dev
```

Regular development remains available through `bun run dev`.

## Shared workspace links

Query-prefill links use a repeatable HTTPS `file` parameter and an optional `command` parameter. Commands are filled into the terminal but never run automatically:

```text
/?file=https%3A%2F%2Fmedia.example.com%2Finput.mp4&command=ffmpeg%20-i%20'.%2Finput.mp4'%20output.webm
```

Remote files are downloaded directly by the visitor's browser. Their host must permit cross-origin browser requests with an appropriate `Access-Control-Allow-Origin` response header. There is no server-side URL proxy.
