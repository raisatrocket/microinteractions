import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copy to clipboard with a self-clearing "copied" flag for button feedback.
 */
export function useCopy(resetMs = 1800) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // Clipboard can be blocked (insecure origin, permissions policy).
        // Nothing actionable for the reader, so fail quietly.
        return
      }
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
    },
    [resetMs],
  )

  return { copied, copy }
}
