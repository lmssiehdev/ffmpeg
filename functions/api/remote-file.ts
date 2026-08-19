import {
  createRemoteFilePolicy,
  isRedirectStatus,
  limitBody,
  MAX_REDIRECTS,
  RemoteFilePolicyError,
  validateRemoteUrl,
} from "./remote-file-policy"

interface Env {
  REMOTE_FILE_ALLOWED_HOSTS?: string
  REMOTE_FILE_MAX_BYTES?: string
}

interface PagesContext {
  request: Request
  env: Env
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  try {
    enforceSameOrigin(request)
    const requestUrl = new URL(request.url)
    const policy = createRemoteFilePolicy(env.REMOTE_FILE_ALLOWED_HOSTS, env.REMOTE_FILE_MAX_BYTES)
    let remoteUrl = validateRemoteUrl(requestUrl.searchParams.get("url") ?? "", policy)

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      let upstream: Response
      try {
        upstream = await fetch(remoteUrl, {
          method: "GET",
          headers: { Accept: "*/*" },
          redirect: "manual",
          signal: request.signal,
        })
      } catch {
        return errorResponse("The remote file could not be reached.", 502)
      }

      if (isRedirectStatus(upstream.status)) {
        const location = upstream.headers.get("Location")
        await upstream.body?.cancel()
        if (!location) return errorResponse("The remote server returned an invalid redirect.", 502)
        if (redirectCount === MAX_REDIRECTS) return errorResponse("The remote file redirected too many times.", 502)
        remoteUrl = validateRemoteUrl(new URL(location, remoteUrl).href, policy)
        continue
      }

      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel()
        return errorResponse(`The remote server returned ${upstream.status}.`, 502)
      }

      const contentLength = parseContentLength(upstream.headers.get("Content-Length"))
      if (contentLength !== null && contentLength > policy.maxBytes) {
        await upstream.body.cancel()
        return errorResponse("The remote file exceeds the configured size limit.", 413)
      }

      const headers = new Headers({
        "Cache-Control": "private, no-store",
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Remote-File-Max-Bytes": String(policy.maxBytes),
      })

      return new Response(limitBody(upstream.body, policy.maxBytes), { status: 200, headers })
    }

    return errorResponse("The remote file redirected too many times.", 502)
  } catch (error) {
    if (error instanceof RemoteFilePolicyError) return errorResponse(error.message, error.status)
    return errorResponse("The remote file request failed.", 500)
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 405, headers: { Allow: "GET" } })
}

function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("Origin")
  if (origin && origin !== new URL(request.url).origin) {
    throw new RemoteFilePolicyError("Cross-origin remote file requests are not allowed.", 403)
  }
}

function parseContentLength(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null
  const length = Number(value)
  return Number.isSafeInteger(length) ? length : null
}

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  )
}
