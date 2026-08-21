# FFmpeg Workspace

FFmpeg Workspace runs FFmpeg and a small Bash-compatible shell inside the browser. People can upload multiple local files, reference them in commands, preview browser-supported media, and download generated outputs without sending local media to an application server.

## Interfaces

- The visual workspace supports local files up to 512 MiB each and 768 MiB of ready uploads in total.
- [Shared links](/docs/shared-links.md) can prefill a command and import up to eight public HTTPS images.
- [The browser API](/docs/browser-api.md) lets browser automation explicitly run commands and retrieve output files.

The FFmpeg core is about 31 MiB. It is prepared after the first usable workspace file on suitable connections, then retained by the browser's HTTP cache using an exact versioned URL. Save-Data, 2G, offline, and hidden-page sessions do not preload it; an explicit FFmpeg command can still load it on demand.

## Privacy boundary

Local uploads and FFmpeg outputs remain in the browser. A remote image named in a shared link is fetched by the site's `/api/image` bridge to work around image-host CORS restrictions; it therefore transits the deployed Cloudflare Worker. The bridge does not process FFmpeg jobs or store the image.

No command runs simply because a URL was opened. Execution always requires a person to submit the visible command or an automation client to call the browser API's `run()` method.
