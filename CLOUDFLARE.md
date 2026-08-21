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

Query-prefill links use a repeatable HTTPS `file` parameter for images and an optional `command` parameter. Commands are filled into the terminal but never run automatically:

```text
/?file=https%3A%2F%2Fimages.example.com%2Finput.png&command=ffmpeg%20-i%20'.%2Finput.png'%20output.webp
```

Each URL is fetched through the same-origin `/api/image` bridge, so the image host does not need to opt into browser CORS. The bridge accepts public HTTPS image URLs from arbitrary hosts, rejects private-network targets and non-image responses, follows only validated redirects, and limits each response to 10 MiB.

The shared-link `file` contract is intentionally image-only. Remote video, audio, subtitle, and other file URLs are not imported—even when their origin permits direct CORS—and the browser does not fall back to fetching them directly. Add those files with the local upload control instead.

Regular `bun run dev` serves the Astro endpoint for normal development. Use `bun run cloudflare:dev` before deployment to verify the Cloudflare runtime and its strictly-public outbound fetch policy.
