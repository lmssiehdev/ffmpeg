# Shared workspace links

The root page accepts an optional `command` parameter and repeatable `file` parameters:

```text
/?file=https%3A%2F%2Fimages.example.com%2Finput.png&command=ffmpeg%20-i%20'.%2Finput.png'%20output.webp
```

- `command` prefills the terminal and is limited to 20,000 characters. It never runs automatically.
- `file` may be repeated up to eight times. URLs are normalized, deduplicated, and imported in order.
- Files must be public HTTPS images without URL credentials.
- The image bridge accepts verified JPEG, PNG, GIF, WebP, and AVIF responses up to 10 MiB each.
- Remote video, audio, subtitles, SVG, and other files are not imported. Add them with the local file picker.

An imported image receives a workspace filename derived from its URL. Use the exact visible filename in the command. Partial success is allowed: valid images are added while individual failures are reported in the terminal.
