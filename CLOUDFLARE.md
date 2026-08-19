# Cloudflare deployment

The Astro site is deployed as a static Cloudflare Pages project. The FFmpeg WASM binary is served from an R2 bucket through a narrowly scoped Pages Function at `/ffmpeg/ffmpeg-core.wasm`.

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
