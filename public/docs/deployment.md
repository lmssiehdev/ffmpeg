# Deployment notes

The Astro application deploys to Cloudflare Workers Static Assets. FFmpeg execution remains client-side. The only remote-import endpoint is `/api/image`, an image-only bridge with public-host validation, redirect revalidation, type verification, and a 10 MiB limit.

The browser loads the pinned FFmpeg core from these exact jsDelivr URLs:

```text
https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js
https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm
```

jsDelivr serves the versioned files with one-year immutable browser caching. The application uses the normal HTTP cache and does not duplicate the 31 MiB WASM file into Cache Storage. Upgrade the core by changing the pinned package version, not by purging or cache-busting an existing exact URL.
