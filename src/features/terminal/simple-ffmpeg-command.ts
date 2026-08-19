const SHELL_ONLY_CHARACTERS = new Set(["|", "&", ";", "<", ">", "`", "$", "*", "?", "[", "]", "{", "}"])

/**
 * Parses the intentionally small shell subset needed by a standalone FFmpeg
 * invocation. Anything requiring expansion, redirection, pipes, or compound
 * shell syntax returns null so just-bash can handle it instead.
 */
export function parseSimpleFfmpegCommand(command: string): string[] | null {
  const words: string[] = []
  let word = ""
  let wordStarted = false
  let quote: "single" | "double" | null = null

  const pushWord = () => {
    if (!wordStarted) return
    words.push(word)
    word = ""
    wordStarted = false
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!

    if (quote === "single") {
      if (character === "'") quote = null
      else word += character
      continue
    }

    if (quote === "double") {
      if (character === '"') {
        quote = null
        continue
      }
      if (character === "$" || character === "`") return null
      if (character === "\\") {
        const next = command[index + 1]
        if (next === undefined || next === "\n") return null
        if (next === '"' || next === "\\") {
          word += next
          index += 1
        } else {
          word += character
        }
        continue
      }

      word += character
      continue
    }

    if (/\s/.test(character)) {
      pushWord()
      continue
    }

    if (character === "#" || SHELL_ONLY_CHARACTERS.has(character)) return null
    if (character === "'") {
      quote = "single"
      wordStarted = true
      continue
    }
    if (character === '"') {
      quote = "double"
      wordStarted = true
      continue
    }
    if (character === "\\") {
      const next = command[index + 1]
      if (next === undefined || next === "\n") return null
      word += next
      wordStarted = true
      index += 1
      continue
    }

    word += character
    wordStarted = true
  }

  if (quote) return null
  pushWord()
  if (words[0] !== "ffmpeg") return null

  return words.slice(1)
}
