const WASM_KEY = "ffmpeg/0.12.10/ffmpeg-core.wasm"

export async function onRequestGet({ env }) {
  const wasm = await env.FFMPEG_ASSETS.get(WASM_KEY)

  if (!wasm) {
    return new Response("FFmpeg runtime asset is unavailable.", { status: 503 })
  }

  const headers = new Headers()
  wasm.writeHttpMetadata(headers)
  headers.set("Content-Type", "application/wasm")
  headers.set("Cache-Control", "public, max-age=31536000, immutable")
  headers.set("ETag", wasm.httpEtag)

  return new Response(wasm.body, { headers })
}
