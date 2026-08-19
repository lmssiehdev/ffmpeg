export const constants = {
  Z_BEST_COMPRESSION: 9,
}

function unsupported(): never {
  throw new Error("Compression commands are not available in this browser workspace.")
}

export function gzipSync(): never {
  return unsupported()
}

export function gunzipSync(): never {
  return unsupported()
}
