export interface FileMentionRange {
  start: number
  end: number
  query: string
  key: string
}

const TRIGGER_BOUNDARY = /(?:^|[\s|&;()<>])@([^\s@|&;()<>]*)$/u
const TOKEN_SUFFIX = /^[^\s@|&;()<>]*/u
const MAX_QUERY_LENGTH = 256

function isPlainShellContext(value: string, end: number) {
  let quote: "single" | "double" | null = null
  let inComment = false
  let inBacktick = false
  let substitutionDepth = 0

  for (let index = 0; index < end; index += 1) {
    const character = value[index]
    const next = value[index + 1]

    if (inComment) {
      if (character === "\n") inComment = false
      continue
    }

    if (quote === "single") {
      if (character === "'") quote = null
      continue
    }

    if (character === "\\") {
      index += 1
      continue
    }

    if (character === "'" && quote !== "double" && !inBacktick) {
      quote = "single"
      continue
    }

    if (character === '"' && !inBacktick) {
      quote = quote === "double" ? null : "double"
      continue
    }

    if (character === "`") {
      inBacktick = !inBacktick
      continue
    }

    if (!inBacktick && character === "$" && next === "(") {
      substitutionDepth += 1
      index += 1
      continue
    }

    if (!inBacktick && character === ")" && substitutionDepth > 0) {
      substitutionDepth -= 1
      continue
    }

    if (
      quote === null &&
      !inBacktick &&
      substitutionDepth === 0 &&
      character === "#" &&
      (index === 0 || /[\s|&;()<>]/u.test(value[index - 1] ?? ""))
    ) {
      inComment = true
    }
  }

  return quote === null && !inComment && !inBacktick && substitutionDepth === 0
}

export function findFileMention(
  value: string,
  selectionStart: number,
  selectionEnd: number = selectionStart,
): FileMentionRange | null {
  if (selectionStart !== selectionEnd) return null

  const caret = Math.max(0, Math.min(selectionStart, value.length))
  const match = value.slice(0, caret).match(TRIGGER_BOUNDARY)
  if (!match) return null

  const queryBeforeCaret = match[1] ?? ""
  if (queryBeforeCaret.length > MAX_QUERY_LENGTH) return null

  const start = caret - queryBeforeCaret.length - 1
  if (!isPlainShellContext(value, start)) return null

  const trailingToken = value.slice(caret).match(TOKEN_SUFFIX)?.[0] ?? ""
  const end = caret + trailingToken.length
  const query = value.slice(start + 1, end)
  if (query.length > MAX_QUERY_LENGTH) return null

  return { start, end, query, key: `${start}:${end}:${query}` }
}

export function replaceFileMention(value: string, mention: FileMentionRange, replacement: string) {
  const suffix = value.slice(mention.end)
  const separator = suffix === "" || !/^\s/u.test(suffix) ? " " : ""
  const nextValue = `${value.slice(0, mention.start)}${replacement}${separator}${suffix}`

  return {
    value: nextValue,
    caret: mention.start + replacement.length + separator.length,
  }
}
