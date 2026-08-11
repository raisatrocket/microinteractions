import { useCallback, useLayoutEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

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
  LETTER_DIAMETER,
  LETTER_RADIUS,
  createLetter,
  stepPhysics,
} from './physics'
import type { Letter } from './physics'
import './style.css'

// A fixed anchor, not a recomputed center: the top-left corner of the
// container never moves, so dragging the bottom-right handle grows the box
// the way every other resizable panel does. Sized from the *default*
// dimensions so the resting state reads centered; at max size the box sits
// closer to the stage's right and bottom edges, which is the normal
// trade-off for a single-corner resize handle.
const ANCHOR_X = (STAGE_WIDTH - CONTAINER_DEFAULT_WIDTH) / 2
const ANCHOR_Y = (STAGE_HEIGHT - CONTAINER_DEFAULT_HEIGHT) / 2 - 16

function clampSize(width: number, height: number) {
  return {
    width: clamp(width, CONTAINER_MIN_WIDTH, CONTAINER_MAX_WIDTH),
    height: clamp(height, CONTAINER_MIN_HEIGHT, CONTAINER_MAX_HEIGHT),
  }
}

/** An evenly spaced starting row, with a little vertical jitter so six
 *  identical circles don't read as a mechanically perfect line. */
function initialLetters(width: number, height: number): Letter[] {
  const count = LETTER_CHARS.length
  const usable = Math.max(width - LETTER_DIAMETER, 40)
  const spacing = usable / (count - 1)
  const startX = width / 2 - (spacing * (count - 1)) / 2
  const cy = height / 2

  return LETTER_CHARS.map((_, i) => {
    const x = clamp(startX + spacing * i, LETTER_RADIUS, width - LETTER_RADIUS)
    const jitter = (i % 2 === 0 ? -1 : 1) * Math.min(height * 0.1, 22)
    const y = clamp(cy + jitter, LETTER_RADIUS, height - LETTER_RADIUS)
    return createLetter(x, y)
  })
}

export default function InflatedLetters() {
  const containerRef = useRef<HTMLDivElement>(null)
  const letterElsRef = useRef<Array<HTMLDivElement | null>>([])

  const sizeRef = useRef({
    width: CONTAINER_DEFAULT_WIDTH,
    height: CONTAINER_DEFAULT_HEIGHT,
  })
  const lettersRef = useRef<Letter[]>(
    initialLetters(CONTAINER_DEFAULT_WIDTH, CONTAINER_DEFAULT_HEIGHT),
  )

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
      if (!el) continue
      const l = letters[i]
      const stretch = 1 - l.squish
      const squash = 1 + l.squish * 0.6
      const deg = (l.squishAngle * 180) / Math.PI
      el.style.transform =
        `translate3d(${l.x - LETTER_RADIUS}px, ${l.y - LETTER_RADIUS}px, 0) ` +
        `rotate(${deg}deg) scale(${stretch}, ${squash}) rotate(${-deg}deg)`
    }
  }, [])

  const tick = useCallback(
    (now: number) => {
      const seconds =
        Math.min((now - lastRef.current) / 1000, 1 / 30) * timeScale.current
      lastRef.current = now

      const active = stepPhysics(
        lettersRef.current,
        sizeRef.current.width,
        sizeRef.current.height,
        seconds,
      )
      paint()

      if (active) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = 0
      }
    },
    [timeScale, paint],
  )

  const wake = useCallback(() => {
    if (rafRef.current) return
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  // Paint the resting arrangement once so the letters are in place before
  // anything ever moves — the physics loop only runs once woken.
  useLayoutEffect(() => {
    paint()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [paint])

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
      event.currentTarget.setPointerCapture(event.pointerId)
      heldIndexRef.current = index
      const letter = lettersRef.current[index]
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
      if (index === null) return

      const letter = lettersRef.current[index]
      const { width, height } = sizeRef.current
      const p = toLocal(event.clientX, event.clientY)
      const now = performance.now()
      const dt = Math.max((now - pointerLastRef.current.t) / 1000, 1 / 240)

      const nextX = clamp(p.x, LETTER_RADIUS, width - LETTER_RADIUS)
      const nextY = clamp(p.y, LETTER_RADIUS, height - LETTER_RADIUS)

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
      if (index !== null) {
        lettersRef.current[index].held = false
      }
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
            ref={(el) => {
              letterElsRef.current[i] = el
            }}
            onPointerDown={handleLetterDown(i)}
            onPointerMove={handleLetterMove}
            onPointerUp={handleLetterUp}
            onPointerCancel={handleLetterUp}
          >
            <span className="letters__glyph">{char}</span>
            <span className="letters__highlight" aria-hidden="true" />
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
