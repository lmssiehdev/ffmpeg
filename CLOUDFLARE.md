# Cloudflare deployment

The Astro site is deployed as a static Cloudflare Pages project. The FFmpeg WASM binary is served from an R2 bucket through a narrowly scoped Pages Function at `/ffmpeg/ffmpeg-core.wasm`.

Shared workspace links can import remote files through `/api/remote-file`. Configure `REMOTE_FILE_ALLOWED_HOSTS` for both preview and production with a comma-separated list of exact HTTPS hosts or explicit wildcard subdomains such as `media.example.com,*.cdn.example.com`. The endpoint fails closed when this variable is absent. `REMOTE_FILE_MAX_BYTES` may optionally lower, but never raise, the 512 MiB per-file cap.

Keep this allowlist narrow. The endpoint deliberately does not accept arbitrary hosts because an unrestricted media proxy would expose the deployment to SSRF and bandwidth abuse. Apply a Cloudflare rate-limiting rule to `/api/remote-file` before enabling public shared links.

Query-prefill links use a repeatable `file` parameter and an optional `command` parameter. Commands are filled into the terminal but never run automatically:

```text
/?file=https%3A%2F%2Fmedia.example.com%2Finput.mp4&command=ffmpeg%20-i%20'.%2Finput.mp4'%20output.webm
```

R2 is required because Cloudflare Pages and Workers Static Assets limit each uploaded asset to 25 MiB, while `ffmpeg-core.wasm` is about 31 MiB.

## First deployment

```sh
bunx wrangler login
bun run cloudflare:bucket:create
bun run deploy
```

The deploy command builds the site, removes the oversized WASM from `dist`, uploads that binary to R2, and deploys the remaining static build plus the Pages Function.

## Later deployments

```sh
bun run deploy
```

The R2 object key is versioned with the installed `@ffmpeg/core` version. When that package is upgraded, update the key in `package.json` and `functions/ffmpeg/ffmpeg-core.wasm.js` together.

## Local Cloudflare preview

Create and populate Wrangler's local R2 storage, then run the Pages emulator:

```sh
bunx wrangler r2 object put ffmpeg-on-the-web-assets/ffmpeg/0.12.10/ffmpeg-core.wasm \
  --file public/ffmpeg/ffmpeg-core.wasm \
  --content-type application/wasm \
  --local
bun run cloudflare:dev
```

Regular `bun run dev` continues to use the raw file in `public/` and does not require Cloudflare or R2.
It does not run the `/api/remote-file` Pages Function. To test query-file imports locally, add the host allowlist to an untracked `.dev.vars` file and use `bun run cloudflare:dev`:

```dotenv
REMOTE_FILE_ALLOWED_HOSTS=media.example.com,*.cdn.example.com
```
