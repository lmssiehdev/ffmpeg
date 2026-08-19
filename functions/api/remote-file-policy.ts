export const DEFAULT_REMOTE_FILE_MAX_BYTES = 512 * 1024 * 1024
export const MAX_REDIRECTS = 5

const MAX_REMOTE_URL_LENGTH = 4096
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".onion"]

export interface RemoteFilePolicy {
  allowedHosts: string[]
  maxBytes: number
}

export class RemoteFilePolicyError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "RemoteFilePolicyError"
    this.status = status
  }
}

export function createRemoteFilePolicy(
  allowedHostsValue: string | undefined,
  maxBytesValue?: string,
): RemoteFilePolicy {
  const allowedHosts = (allowedHostsValue ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean)

  if (allowedHosts.length === 0) {
    throw new RemoteFilePolicyError("Remote file fetching is not configured.", 503)
  }

  for (const host of allowedHosts) {
    const candidate = host.startsWith("*.") ? host.slice(2) : host
    if (!isPublicHostname(candidate) || host.includes("*", 1)) {
      throw new RemoteFilePolicyError("Remote file host configuration is invalid.", 503)
    }
  }

  const configuredMaxBytes = maxBytesValue === undefined ? DEFAULT_REMOTE_FILE_MAX_BYTES : Number(maxBytesValue)
  if (
    !Number.isSafeInteger(configuredMaxBytes) ||
    configuredMaxBytes <= 0 ||
    configuredMaxBytes > DEFAULT_REMOTE_FILE_MAX_BYTES
  ) {
    throw new RemoteFilePolicyError("Remote file size configuration is invalid.", 503)
  }

  return { allowedHosts, maxBytes: configuredMaxBytes }
}

export function validateRemoteUrl(value: string, policy: RemoteFilePolicy): URL {
  if (value.length === 0 || value.length > MAX_REMOTE_URL_LENGTH) {
    throw new RemoteFilePolicyError("Provide a valid remote file URL.", 400)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new RemoteFilePolicyError("Provide a valid remote file URL.", 400)
  }

  if (url.protocol !== "https:") {
    throw new RemoteFilePolicyError("Remote files must use HTTPS.", 400)
  }
  if (url.username || url.password) {
    throw new RemoteFilePolicyError("Remote file URLs cannot include credentials.", 400)
  }
  if (url.port && url.port !== "443") {
    throw new RemoteFilePolicyError("Remote file URLs cannot use a custom port.", 400)
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!isPublicHostname(hostname) || !policy.allowedHosts.some((pattern) => matchesHost(hostname, pattern))) {
    throw new RemoteFilePolicyError("This remote file host is not allowed.", 403)
  }

  url.hostname = hostname
  url.hash = ""
  return url
}

export function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

export function limitBody(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  let receivedBytes = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await reader.read()
      if (result.done) {
        controller.close()
        return
      }

      receivedBytes += result.value.byteLength
      if (receivedBytes > maxBytes) {
        await reader.cancel("Remote file exceeded the configured size limit.")
        controller.error(new Error("Remote file exceeded the configured size limit."))
        return
      }

      controller.enqueue(result.value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

function matchesHost(hostname: string, pattern: string) {
  if (!pattern.startsWith("*.")) return hostname === pattern

  const suffix = pattern.slice(1)
  return hostname.endsWith(suffix) && hostname.length > suffix.length
}

function isPublicHostname(hostname: string) {
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return false
  }

  // URL parsing canonicalizes unusual IPv4 forms. Reject every IP literal so the
  // allowlist remains a DNS-name boundary and cannot accidentally admit a private IP.
  if (hostname.includes(":") || /^\d+(?:\.\d+){0,3}$/.test(hostname)) return false

  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)
}
