import { stat, unlink } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const wasmUrl = new URL("../dist/ffmpeg/ffmpeg-core.wasm", import.meta.url)
const wasmPath = fileURLToPath(wasmUrl)
const { size } = await stat(wasmPath)

if (size <= 25 * 1024 * 1024) {
  throw new Error(`Expected FFmpeg WASM to exceed Cloudflare's 25 MiB asset limit; found ${size} bytes.`)
}

await unlink(wasmPath)
console.log(`Moved ${size} byte FFmpeg WASM out of the Pages bundle; it is served from R2.`)
