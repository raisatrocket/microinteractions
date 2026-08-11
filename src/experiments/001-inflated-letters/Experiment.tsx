import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

import { STAGE_HEIGHT, STAGE_WIDTH } from '../../components/Stage'
import { clamp } from '../../lib/util'
import { useStageScale, useTimeScale } from '../../stage/stage-context'
import {
  CONTAINER_DEFAULT_HEIGHT,
  CONTAINER_DEFAULT_WIDTH,
  CONTAINER_MAX_HEIGHT,
  CONTAINER_MAX_WIDTH,
  CONTAINER_MIN_HEIGHT,
  CONTAINER_MIN_WIDTH,
  LETTER_CHARS,
  createLetter,
  resolveLetterShape,
  stepPhysics,
} from './physics'
import type { Letter } from './physics'
import './style.css'

/** A saturated color per letter — no two touching in the starting row land
 *  close on the color wheel. */
const LETTER_COLORS = [
  '#ff5b52', // B — coral red
  '#ffc93c', // U — golden yellow
  '#3db4f2', // B — sky blue
  '#ff4fa0', // B — hot pink
  '#5fcb53', // L — grass green
  '#a76bfa', // E — violet purple
] as const

const GAP = 12
const FONT_SPEC = '800 1em "Baloo 2"'

// A fixed anchor, not a recomputed center: the top-left corner of the
// container never moves, so dragging the bottom-right handle grows the box
// the way every other resizable panel does.
const ANCHOR_X = (STAGE_WIDTH - CONTAINER_DEFAULT_WIDTH) / 2
const ANCHOR_Y = (STAGE_HEIGHT - CONTAINER_DEFAULT_HEIGHT) / 2 - 16

function clampSize(width: number, height: number) {
  return {
    width: clamp(width, CONTAINER_MIN_WIDTH, CONTAINER_MAX_WIDTH),
    height: clamp(height, CONTAINER_MIN_HEIGHT, CONTAINER_MAX_HEIGHT),
  }
}

/** An evenly spaced starting row using each letter's *own* measured width —
 *  a narrow "L" and a wide "B" don't get equal space — with a little
 *  vertical jitter so it doesn't read as a mechanically perfect line. */
function layoutRow(
  letters: Letter[],
  containerWidth: number,
  containerHeight: number,
): void {
  const widths = letters.map((l) => l.shape.halfWidth * 2)
  const totalWidth =
    widths.reduce((sum, w) => sum + w, 0) + GAP * (letters.length - 1)
  let cursor = (containerWidth - totalWidth) / 2
  const cy = containerHeight / 2

  letters.forEach((l, i) => {
    const w = widths[i]
    const jitter = (i % 2 === 0 ? -1 : 1) * Math.min(containerHeight * 0.08, 16)
    l.x = clamp(
      cursor + w / 2,
      l.shape.halfWidth,
      containerWidth - l.shape.halfWidth,
    )
    l.y = clamp(
      cy + jitter,
      l.shape.halfHeight,
      containerHeight - l.shape.halfHeight,
    )
    cursor += w + GAP
  })
}

/** Web font metrics can't be known before the font actually loads, and
 *  measuring against the fallback would calibrate every collision shape
 *  wrong. Waits, with a short timeout so a font failure can't leave the
 *  stage blank forever. */
async function waitForFont(): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load(FONT_SPEC),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
  } catch {
    // Proceed with whatever the fallback stack renders.
  }
}

export default function InflatedLetters() {
  const containerRef = useRef<HTMLDivElement>(null)
  const letterElsRef = useRef<Array<HTMLDivElement | null>>([])
  const [ready, setReady] = useState(false)

  const sizeRef = useRef({
    width: CONTAINER_DEFAULT_WIDTH,
    height: CONTAINER_DEFAULT_HEIGHT,
  })
  const lettersRef = useRef<Letter[]>([])

  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const heldIndexRef = useRef<number | null>(null)
  const pointerLastRef = useRef({ x: 0, y: 0, t: 0 })
  const resizingRef = useRef(false)
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const timeScale = useTimeScale()
  const stageScale = useStageScale()

  const paint = useCallback(() => {
    const letters = lettersRef.current
    for (let i = 0; i < letters.length; i++) {
      const el = letterElsRef.current[i]
      const l = letters[i]
      if (!el || !l) continue
      const stretch = 1 - l.squish
      const squash = 1 + l.squish * 0.6
      const deg = (l.squishAngle * 180) / Math.PI
      el.style.transform =
        `translate3d(${l.x - l.shape.halfWidth}px, ${l.y - l.shape.halfHeight}px, 0) ` +
        `rotate(${deg}deg) scale(${stretch}, ${squash}) rotate(${-deg}deg)`
    }
  }, [])

  const tick = useCallback(
    (now: number) => {
      // rAF timestamps and performance.now() can disagree by a hair under
      // bursty input (several pointer events processed before the browser's
      // next frame timestamp is settled) — clamp below zero the same way the
      // top end is already clamped, or a negative dt silently skips every
      // substep and the sim looks frozen.
      const seconds =
        Math.max(Math.min((now - lastRef.current) / 1000, 1 / 30), 0) *
        timeScale.current
      lastRef.current = now

      const active = stepPhysics(
        lettersRef.current,
        sizeRef.current.width,
        sizeRef.current.height,
        seconds,
      )
      paint()

      rafRef.current = active ? requestAnimationFrame(tick) : 0
    },
    [timeScale, paint],
  )

  const wake = useCallback(() => {
    if (rafRef.current) return
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  // Measure the real rendered glyphs — once the web font has actually
  // loaded — build each letter's collision shape from that measurement, and
  // lay out the starting arrangement, all before this ever paints. No flash
  // of wrongly-sized or wrongly-positioned letters.
  useLayoutEffect(() => {
    let cancelled = false

    void waitForFont().then(() => {
      if (cancelled) return
      const letters = LETTER_CHARS.map((char, i) => {
        const rect = letterElsRef.current[i]?.getBoundingClientRect()
        const width = rect?.width || 80
        const height = rect?.height || 96
        return createLetter(char, 0, 0, resolveLetterShape(char, width, height))
      })
      layoutRow(letters, sizeRef.current.width, sizeRef.current.height)
      lettersRef.current = letters
      paint()
      setReady(true)
      // The hand-authored starting row is usually already clear of overlap,
      // but glyph metrics vary slightly by platform — wake the sim so any
      // that isn't settles itself immediately rather than sitting frozen
      // until the reader happens to touch something.
      wake()
    })

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [paint, wake])

  const toLocal = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current
      if (!container) return { x: 0, y: 0 }
      const rect = container.getBoundingClientRect()
      const scale = stageScale.current || 1
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      }
    },
    [stageScale],
  )

  const handleLetterDown = useCallback(
    (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      const letter = lettersRef.current[index]
      if (!letter) return
      event.currentTarget.setPointerCapture(event.pointerId)
      heldIndexRef.current = index
      letter.held = true
      const p = toLocal(event.clientX, event.clientY)
      pointerLastRef.current = { x: p.x, y: p.y, t: performance.now() }
      wake()
    },
    [toLocal, wake],
  )

  const handleLetterMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const index = heldIndexRef.current
      const letter = index === null ? null : lettersRef.current[index]
      if (!letter) return

      const { width, height } = sizeRef.current
      const p = toLocal(event.clientX, event.clientY)
      const now = performance.now()
      const dt = Math.max((now - pointerLastRef.current.t) / 1000, 1 / 240)

      const nextX = clamp(
        p.x,
        letter.shape.halfWidth,
        width - letter.shape.halfWidth,
      )
      const nextY = clamp(
        p.y,
        letter.shape.halfHeight,
        height - letter.shape.halfHeight,
      )

      // Smoothed velocity from the drag, so a release carries a believable
      // fling instead of whatever the last, possibly noisy, pointer event was.
      const rawVx = (nextX - letter.x) / dt
      const rawVy = (nextY - letter.y) / dt
      letter.vx = letter.vx * 0.5 + rawVx * 0.5
      letter.vy = letter.vy * 0.5 + rawVy * 0.5

      letter.x = nextX
      letter.y = nextY
      pointerLastRef.current = { x: p.x, y: p.y, t: now }
      wake()
    },
    [toLocal, wake],
  )

  const handleLetterUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const index = heldIndexRef.current
      const letter = index === null ? null : lettersRef.current[index]
      if (letter) letter.held = false
      heldIndexRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
    [],
  )

  const handleResizeDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      resizingRef.current = true
      resizeStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
      }
      wake()
    },
    [wake],
  )

  const handleResizeMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizingRef.current) return
      const scale = stageScale.current || 1
      const dx = (event.clientX - resizeStartRef.current.x) / scale
      const dy = (event.clientY - resizeStartRef.current.y) / scale
      const { width, height } = clampSize(
        resizeStartRef.current.width + dx,
        resizeStartRef.current.height + dy,
      )
      sizeRef.current = { width, height }
      const container = containerRef.current
      if (container) {
        container.style.width = `${width}px`
        container.style.height = `${height}px`
      }
      wake()
    },
    [stageScale, wake],
  )

  const handleResizeUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      resizingRef.current = false
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
    [],
  )

  return (
    <div className="letters">
      <div
        className="letters__container"
        ref={containerRef}
        style={{
          left: ANCHOR_X,
          top: ANCHOR_Y,
          width: sizeRef.current.width,
          height: sizeRef.current.height,
        }}
      >
        {LETTER_CHARS.map((char, i) => (
          <div
            key={i}
            className="letters__bubble"
            style={
              {
                '--tint': LETTER_COLORS[i],
                opacity: ready ? 1 : 0,
              } as CSSProperties
            }
            ref={(el) => {
              letterElsRef.current[i] = el
            }}
            onPointerDown={handleLetterDown(i)}
            onPointerMove={handleLetterMove}
            onPointerUp={handleLetterUp}
            onPointerCancel={handleLetterUp}
          >
            <span className="letters__fill">{char}</span>
            <span className="letters__gloss" aria-hidden="true">
              {char}
            </span>
          </div>
        ))}

        <div
          className="letters__handle"
          aria-hidden="true"
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
          onPointerCancel={handleResizeUp}
        >
          <HandleIcon />
        </div>
      </div>

      <p className="letters__hint mono">Drag a letter · resize the corner</p>
    </div>
  )
}

function HandleIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 1L1 9M9 5L5 9M9 9L9 9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
