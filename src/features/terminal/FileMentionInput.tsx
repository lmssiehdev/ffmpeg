import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ChangeEventHandler,
  type CompositionEventHandler,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react"

import { findFileMention, replaceFileMention } from "@/features/terminal/file-mentions"
import { quoteWorkspaceFile } from "@/features/terminal/shell"
import type { WorkspaceAsset } from "@/features/workspace/types"
import { cn } from "@/lib/utils"

type ChangeCallbacks =
  | {
      onChange: ChangeEventHandler<HTMLInputElement>
      onValueChange?: (value: string) => void
    }
  | {
      onChange?: ChangeEventHandler<HTMLInputElement>
      onValueChange: (value: string) => void
    }

export type FileMentionInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "onCompositionEnd" | "onCompositionStart" | "value"
> &
  ChangeCallbacks & {
    value: string
    readyAssets: readonly WorkspaceAsset[]
    containerClassName?: string
    maxSuggestions?: number
    onCompositionEnd?: CompositionEventHandler<HTMLInputElement>
    onCompositionStart?: CompositionEventHandler<HTMLInputElement>
  }

export const FileMentionInput = forwardRef<HTMLInputElement, FileMentionInputProps>(function FileMentionInput(
  {
    "aria-describedby": ariaDescribedBy,
    className,
    containerClassName,
    disabled,
    maxSuggestions = 8,
    onBlur,
    onChange,
    onClick,
    onCompositionEnd,
    onCompositionStart,
    onFocus,
    onKeyDown,
    onKeyUp,
    onSelect,
    onValueChange,
    readOnly,
    readyAssets,
    value,
    ...inputProps
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const optionRefs = useRef<Array<HTMLLIElement | null>>([])
  const listboxId = `${useId().replaceAll(":", "")}-file-mentions`
  const [activeIndex, setActiveIndex] = useState(0)
  const [caret, setCaret] = useState(value.length)
  const [dismissedMention, setDismissedMention] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [isComposing, setIsComposing] = useState(false)

  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (!forwardedRef) return
      if ("current" in forwardedRef) forwardedRef.current = node
      else forwardedRef(node)
    },
    [forwardedRef],
  )

  const mention = useMemo(() => findFileMention(value, caret), [caret, value])
  const suggestions = useMemo(() => {
    if (!mention) return []

    const query = mention.query.toLocaleLowerCase()
    const names = new Set<string>()

    return readyAssets
      .filter((asset) => {
        if (asset.status !== "ready" || names.has(asset.name)) return false
        names.add(asset.name)
        return true
      })
      .filter((asset) => asset.name.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const leftStartsWith = left.name.toLocaleLowerCase().startsWith(query)
        const rightStartsWith = right.name.toLocaleLowerCase().startsWith(query)
        if (leftStartsWith !== rightStartsWith) return leftStartsWith ? -1 : 1
        return left.name.localeCompare(right.name)
      })
      .slice(0, Math.max(1, maxSuggestions))
  }, [maxSuggestions, mention, readyAssets])

  const canOpen = !disabled && !readOnly && focused && !isComposing && mention !== null
  const isOpen = canOpen && dismissedMention !== mention.key
  const resolvedActiveIndex = suggestions.length ? Math.min(activeIndex, suggestions.length - 1) : 0
  const activeOptionId = isOpen && suggestions.length ? `${listboxId}-option-${resolvedActiveIndex}` : undefined

  useEffect(() => {
    setActiveIndex(0)
  }, [mention?.key])

  useEffect(() => {
    if (!isOpen || !suggestions.length) return
    optionRefs.current[resolvedActiveIndex]?.scrollIntoView({ block: "nearest" })
  }, [isOpen, resolvedActiveIndex, suggestions.length])

  const updateCaret = (input: HTMLInputElement) => {
    setCaret(input.selectionStart ?? input.value.length)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateCaret(event.currentTarget)
    onChange?.(event)
    onValueChange?.(event.currentTarget.value)
  }

  const commitValue = (nextValue: string, nextCaret: number) => {
    const input = inputRef.current
    if (!input) return

    if (onChange) {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      if (nativeValueSetter) nativeValueSetter.call(input, nextValue)
      else input.value = nextValue
      input.dispatchEvent(new Event("input", { bubbles: true }))
    } else {
      onValueChange?.(nextValue)
    }

    setCaret(nextCaret)
    setDismissedMention(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const chooseSuggestion = (asset: WorkspaceAsset) => {
    if (!mention) return

    const quotedFilename = quoteWorkspaceFile(asset.name)
    const replacement = replaceFileMention(value, mention, quotedFilename)
    commitValue(replacement.value, replacement.caret)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const composing = isComposing || event.nativeEvent.isComposing
    if (!composing && isOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        if (suggestions.length) {
          setActiveIndex((current) => (Math.min(current, suggestions.length - 1) + 1) % suggestions.length)
        }
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        if (suggestions.length) {
          setActiveIndex((current) => {
            const bounded = Math.min(current, suggestions.length - 1)
            return (bounded - 1 + suggestions.length) % suggestions.length
          })
        }
        return
      }

      if (event.key === "Enter" && suggestions.length) {
        event.preventDefault()
        chooseSuggestion(suggestions[resolvedActiveIndex]!)
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        setDismissedMention(mention.key)
        return
      }
    }

    onKeyDown?.(event)
  }

  return (
    <div className={cn("relative min-w-0 flex-1", containerClassName)}>
      <input
        {...inputProps}
        ref={setInputRef}
        className={cn("w-full", className)}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={isOpen ? listboxId : undefined}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-activedescendant={activeOptionId}
        onChange={handleChange}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        onClick={(event) => {
          updateCaret(event.currentTarget)
          onClick?.(event)
        }}
        onCompositionStart={(event) => {
          setIsComposing(true)
          onCompositionStart?.(event)
        }}
        onCompositionEnd={(event) => {
          setIsComposing(false)
          updateCaret(event.currentTarget)
          onCompositionEnd?.(event)
        }}
        onFocus={(event) => {
          setFocused(true)
          setDismissedMention(null)
          updateCaret(event.currentTarget)
          onFocus?.(event)
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (!event.nativeEvent.isComposing) updateCaret(event.currentTarget)
          onKeyUp?.(event)
        }}
        onSelect={(event) => {
          updateCaret(event.currentTarget)
          onSelect?.(event)
        }}
      />

      {isOpen && (
        <div className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Mention a workspace file</div>
          <ul id={listboxId} className="max-h-56 overflow-y-auto p-1" role="listbox" aria-label="Workspace files">
            {suggestions.length ? (
              suggestions.map((asset, index) => (
                <li
                  ref={(node) => {
                    optionRefs.current[index] = node
                  }}
                  id={`${listboxId}-option-${index}`}
                  key={asset.id}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm",
                    index === resolvedActiveIndex && "bg-accent text-accent-foreground",
                  )}
                  role="option"
                  aria-selected={index === resolvedActiveIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(asset)}
                >
                  <span className="min-w-0 truncate font-medium">{asset.name}</span>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">{asset.source}</span>
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground" role="presentation">
                No matching workspace files
              </li>
            )}
          </ul>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {isOpen
          ? suggestions.length
            ? `${suggestions.length} matching workspace ${suggestions.length === 1 ? "file" : "files"}.`
            : "No matching workspace files."
          : ""}
      </p>
    </div>
  )
})
