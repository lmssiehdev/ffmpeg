export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_REDIRECTS = 5

const MAX_URL_LENGTH = 4096
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
  ".onion",
  ".test",
  ".invalid",
  ".example",
]
export type SupportedImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif"

const IMAGE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
} satisfies Record<SupportedImageMime, string>

export interface ProxiedImage {
  bytes: Uint8Array
  contentType: SupportedImageMime
  filename: string
}

export interface FetchImageOptions {
  fetcher?: typeof fetch
  maxBytes?: number
  requestOrigin?: string
  signal?: AbortSignal
}

export class ImageProxyError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ImageProxyError"
    this.status = status
  }
}

export function validatePublicImageUrl(value: string, requestOrigin?: string): URL {
  if (!value || value.length > MAX_URL_LENGTH) throw new ImageProxyError("Provide a valid image URL.", 400)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ImageProxyError("Provide a valid image URL.", 400)
  }

  if (url.protocol !== "https:") throw new ImageProxyError("Image URLs must use HTTPS.", 400)
  if (url.username || url.password) throw new ImageProxyError("Image URLs cannot include credentials.", 400)
  if (url.port && url.port !== "443") throw new ImageProxyError("Image URLs cannot use a custom port.", 400)

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!isPublicDnsHostname(hostname)) throw new ImageProxyError("The image host is not public.", 403)

  url.hostname = hostname
  url.hash = ""
  if (requestOrigin && url.origin === requestOrigin) {
    throw new ImageProxyError("The image endpoint cannot fetch from itself.", 403)
  }

  return url
}

export async function fetchPublicImage(value: string, options: FetchImageOptions = {}): Promise<ProxiedImage> {
  const fetcher = options.fetcher ?? fetch
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES
  let url = validatePublicImageUrl(value, options.requestOrigin)

  for (let redirects = 0; redirects <= MAX_IMAGE_REDIRECTS; redirects += 1) {
    let response: Response
    try {
      response = await fetcher(url, {
        method: "GET",
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
        redirect: "manual",
        signal: options.signal,
      })
    } catch {
      throw new ImageProxyError("The image host could not be reached.", 502)
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get("Location")
      await response.body?.cancel()
      if (!location) throw new ImageProxyError("The image host returned an invalid redirect.", 502)
      if (redirects === MAX_IMAGE_REDIRECTS) throw new ImageProxyError("The image redirected too many times.", 502)
      try {
        url = validatePublicImageUrl(new URL(location, url).href, options.requestOrigin)
      } catch (error) {
        if (error instanceof ImageProxyError) throw error
        throw new ImageProxyError("The image host returned an invalid redirect.", 502)
      }
      continue
    }

    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new ImageProxyError(`The image host returned ${response.status}.`, 502)
    }

    const contentType = parseSupportedMime(response.headers.get("Content-Type"))
    if (!contentType) {
      await response.body.cancel()
      throw new ImageProxyError("The URL did not return a supported image type.", 415)
    }

    const declaredLength = parseContentLength(response.headers.get("Content-Length"))
    if (declaredLength !== null && declaredLength > maxBytes) {
      await response.body.cancel()
      throw new ImageProxyError("The image exceeds the 10 MiB size limit.", 413)
    }

    let bytes: Uint8Array
    try {
      bytes = await readBodyWithLimit(response.body, maxBytes)
    } catch (error) {
      if (error instanceof ImageProxyError) throw error
      throw new ImageProxyError("The image could not be downloaded.", 502)
    }
    if (!hasExpectedMagic(bytes, contentType)) {
      throw new ImageProxyError("The image content does not match its declared type.", 415)
    }

    return {
      bytes,
      contentType,
      filename: filenameFromUrl(url, contentType),
    }
  }

  throw new ImageProxyError("The image redirected too many times.", 502)
}

export function contentDisposition(filename: string) {
  const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  const encodedName = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
}

function isPublicDnsHostname(hostname: string) {
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return false
  }

  // The URL parser canonicalizes unusual IPv4 spellings such as integer and
  // hexadecimal forms. Reject every IP literal; Cloudflare's strictly-public
  // fetch mode provides the DNS-resolution boundary at request time.
  if (hostname.includes(":") || /^\d+(?:\.\d+){0,3}$/.test(hostname)) return false

  return (
    hostname.length <= 253 && hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function parseSupportedMime(value: string | null): SupportedImageMime | null {
  const mime = value?.split(";", 1)[0]?.trim().toLowerCase()
  return mime && isSupportedMime(mime) ? mime : null
}

function isSupportedMime(value: string): value is SupportedImageMime {
  return Object.hasOwn(IMAGE_EXTENSIONS, value)
}

function parseContentLength(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null
  const length = Number(value)
  return Number.isSafeInteger(length) ? length : null
}

async function readBodyWithLimit(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  while (true) {
    const result = await reader.read()
    if (result.done) break

    byteLength += result.value.byteLength
    if (byteLength > maxBytes) {
      await reader.cancel("Image exceeded the size limit.")
      throw new ImageProxyError("The image exceeds the 10 MiB size limit.", 413)
    }
    chunks.push(result.value)
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function hasExpectedMagic(bytes: Uint8Array, contentType: SupportedImageMime) {
  switch (contentType) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case "image/gif":
      return ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a"
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP"
    case "image/avif":
      return hasAvifBrand(bytes)
  }
}

function hasAvifBrand(bytes: Uint8Array) {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return false

  const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  const end = Math.min(boxSize || bytes.length, bytes.length)
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    const brand = ascii(bytes, offset, 4)
    if (brand === "avif" || brand === "avis") return true
  }
  return false
}

function startsWith(bytes: Uint8Array, expected: number[]) {
  return bytes.length >= expected.length && expected.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (offset + length > bytes.length) return ""
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function filenameFromUrl(url: URL, contentType: SupportedImageMime) {
  const rawSegment = url.pathname.split("/").pop() || "image"
  let decodedSegment: string
  try {
    decodedSegment = decodeURIComponent(rawSegment)
  } catch {
    decodedSegment = rawSegment
  }

  const cleaned = [...decodedSegment]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || codePoint === 127 || character === "/" || character === "\\" ? "_" : character
    })
    .join("")
    .trim()
    .slice(0, 180)
  const base = cleaned || "image"
  const extension = IMAGE_EXTENSIONS[contentType]
  const acceptedExtensions = contentType === "image/jpeg" ? [".jpg", ".jpeg"] : [extension]
  return acceptedExtensions.some((candidate) => base.toLowerCase().endsWith(candidate)) ? base : `${base}${extension}`
}
