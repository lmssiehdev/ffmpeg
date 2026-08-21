import type { APIRoute } from "astro"

import { contentDisposition, fetchPublicImage, ImageProxyError } from "@/lib/image-proxy"

export const prerender = false

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const origin = request.headers.get("Origin")
    if (origin && origin !== url.origin) return errorResponse("Cross-origin image requests are not allowed.", 403)

    const image = await fetchPublicImage(url.searchParams.get("url") ?? "", {
      requestOrigin: url.origin,
      signal: request.signal,
    })

    const responseBytes = new Uint8Array(image.bytes.byteLength)
    responseBytes.set(image.bytes)
    return new Response(responseBytes.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDisposition(image.filename),
        "Content-Length": String(image.bytes.byteLength),
        "Content-Type": image.contentType,
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Image-Filename": encodeURIComponent(image.filename),
      },
    })
  } catch (error) {
    if (error instanceof ImageProxyError) return errorResponse(error.message, error.status)
    return errorResponse("The image request failed.", 500)
  }
}

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  )
}
