import { useCallback, useLayoutEffect, useRef } from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from 'react'

import { STAGE_HEIGHT, STAGE_WIDTH } from '../../components/Stage'
import { clamp } from '../../lib/util'
import { useStageScale, useTimeScale } from '../../stage/stage-context'
import {
  BASE_SIZE,
  CONTAINER_DEFAULT_HEIGHT,
  CONTAINER_DEFAULT_WIDTH,
  CONTAINER_MAX_HEIGHT,
  CONTAINER_MAX_WIDTH,
  CONTAINER_MIN_HEIGHT,
  CONTAINER_MIN_WIDTH,
  LETTER_CHARS,
  MAX_DILATION_PX,
  MAX_SIZE,
  MIN_SIZE,
  createLetter,
  letterWidth,
  liveHoles,
  rescaleLetter,
  stepPhysics,
} from './physics'
import type { Letter } from './physics'
import type { Vec } from './outlines'
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

const GAP = 20
/** 0-100. Matched to the firmness/visual constants below so the default
 *  slider position reproduces the look and feel this shipped with. */
const DEFAULT_INFLATION = 70

/** How strongly a letter resists deformation, derived from the inflation
 *  slider — the softer/firmer half of what "inflation" means physically.
 *  0 -> quite floppy, 100 -> taut and springs back fast. */
function firmnessFromInflation(inflation: number): number {
  return 0.42 + (inflation / 100) * 1.35
}

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

/** An evenly spaced starting row using each letter's own width — a narrow
 *  "L" and a wide "B" don't get equal space — with a little vertical jitter
 *  so it doesn't read as a mechanically perfect line. Snaps every node
 *  straight to its resting offset around the row position: nothing has
 *  moved yet, so there's no need to let the spring animate into place. */
function layoutRow(
  letters: Letter[],
  containerWidth: number,
  containerHeight: number,
  size: number,
): void {
  const widths = letters.map((l) => letterWidth(l.char, size))
  const totalWidth =
    widths.reduce((sum, w) => sum + w, 0) + GAP * (letters.length - 1)
  let cursor = (containerWidth - totalWidth) / 2
  const cy = containerHeight / 2

  letters.forEach((l, i) => {
    const w = widths[i]
    const jitter = (i % 2 === 0 ? -1 : 1) * Math.min(containerHeight * 0.08, 16)
    const targetX = clamp(
      cursor + w / 2,
      l.boundingRadius,
      containerWidth - l.boundingRadius,
    )
    const targetY = clamp(
      cy + jitter,
      l.boundingRadius,
      containerHeight - l.boundingRadius,
    )

    for (const n of l.outer) {
      n.x = targetX + n.restX
      n.y = targetY + n.restY
      n.vx = 0
      n.vy = 0
    }
    l.cx = targetX
    l.cy = targetY
    l.angle = 0
    l.targetX = targetX
    l.targetY = targetY

    cursor += w + GAP
  })
}

/** A smooth closed curve through a polygon's edge midpoints, using each
 *  original vertex as the control point for the curve either side of it —
 *  a cheap, always-stable way to turn a modest point count into something
 *  that reads as a soft, rounded outline rather than a faceted polygon. */
function smoothPath(points: Vec[]): string {
  const n = points.length
  if (n < 3) return ''
  const mid = (a: Vec, b: Vec) => `${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`

  let d = `M ${mid(points[n - 1], points[0])} `
  for (let i = 0; i < n; i++) {
    const curr = points[i]
    const next = points[(i + 1) % n]
    d += `Q ${curr.x} ${curr.y} ${mid(curr, next)} `
  }
  return d + 'Z'
}

function buildPathD(letter: Letter): string {
  let d = smoothPath(letter.outer)
  for (const hole of liveHoles(letter)) {
    d += ' ' + smoothPath(hole)
  }
  return d
}

export default function InflatedLetters() {
  const containerRef = useRef<HTMLDivElement>(null)
  const pathElsRef = useRef<Array<SVGPathElement | null>>([])

  const sizeRef = useRef({
    width: CONTAINER_DEFAULT_WIDTH,
    height: CONTAINER_DEFAULT_HEIGHT,
  })

  const lettersRef = useRef<Letter[]>(
    (() => {
      const letters = LETTER_CHARS.map((char) =>
        createLetter(char, 0, 0, BASE_SIZE),
      )
      layoutRow(
        letters,
        CONTAINER_DEFAULT_WIDTH,
        CONTAINER_DEFAULT_HEIGHT,
        BASE_SIZE,
      )
      return letters
    })(),
  )

  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const heldIndexRef = useRef<number | null>(null)
  const resizingRef = useRef(false)
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const firmnessRef = useRef(firmnessFromInflation(DEFAULT_INFLATION))
  const dilationRef = useRef(DEFAULT_INFLATION / 100)

  const timeScale = useTimeScale()
  const stageScale = useStageScale()

  const paint = useCallback(() => {
    const letters = lettersRef.current
    for (let i = 0; i < letters.length; i++) {
      const el = pathElsRef.current[i]
      if (!el) continue
      el.setAttribute('d', buildPathD(letters[i]))
    }
  }, [])

  const tick = useCallback(
    (now: number) => {
      // rAF timestamps and performance.now() can disagree by a hair under
      // bursty input — clamp below zero, or a negative dt silently skips
      // every substep and the sim looks frozen.
      const seconds =
        Math.max(Math.min((now - lastRef.current) / 1000, 1 / 30), 0) *
        timeScale.current
      lastRef.current = now

      const active = stepPhysics(
        lettersRef.current,
        sizeRef.current.width,
        sizeRef.current.height,
        seconds,
        firmnessRef.current,
        dilationRef.current,
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

  // The starting arrangement is built synchronously above (no web font to
  // wait on — the outlines are hand-authored data, not a measured glyph) —
  // just paint it once before the browser's first real frame.
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
    (index: number) => (event: ReactPointerEvent<SVGPathElement>) => {
      const letter = lettersRef.current[index]
      if (!letter) return
      event.currentTarget.setPointerCapture(event.pointerId)
      heldIndexRef.current = index
      letter.held = true
      const { width, height } = sizeRef.current
      const p = toLocal(event.clientX, event.clientY)
      letter.targetX = clamp(
        p.x,
        letter.boundingRadius,
        width - letter.boundingRadius,
      )
      letter.targetY = clamp(
        p.y,
        letter.boundingRadius,
        height - letter.boundingRadius,
      )
      wake()
    },
    [toLocal, wake],
  )

  const handleLetterMove = useCallback(
    (event: ReactPointerEvent<SVGPathElement>) => {
      const index = heldIndexRef.current
      const letter = index === null ? null : lettersRef.current[index]
      if (!letter) return

      const { width, height } = sizeRef.current
      const p = toLocal(event.clientX, event.clientY)
      letter.targetX = clamp(
        p.x,
        letter.boundingRadius,
        width - letter.boundingRadius,
      )
      letter.targetY = clamp(
        p.y,
        letter.boundingRadius,
        height - letter.boundingRadius,
      )
      wake()
    },
    [toLocal, wake],
  )

  const handleLetterUp = useCallback(
    (event: ReactPointerEvent<SVGPathElement>) => {
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

  // Global — one write to the container's own custom property reaches every
  // letter through CSS inheritance. Rebuilding the rest geometry doesn't
  // move anything itself; the shape-matching spring animates the grow or
  // shrink over the next several frames, which is what makes this read as
  // the letter actually inflating rather than snapping to a new size.
  const handleSizeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const size = event.currentTarget.valueAsNumber
      for (const letter of lettersRef.current) {
        rescaleLetter(letter, size)
      }
      wake()
    },
    [wake],
  )

  // Inflation has three halves, all driven by the same 0-100 value: a
  // visual gradient/gloss/shadow depth, a visual stroke-based dilation that
  // actually thickens the rendered glyph (via --inflation in the CSS,
  // consumed as a stroke-width calc()), and a physical firmness — how hard
  // the shape resists deformation. Collision gets matching extra clearance
  // for the dilation (see physics.ts's `dilation` param) so the puffed-up
  // look never overlaps even though the simulated boundary hasn't grown.
  const handleInflationChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const inflation = event.currentTarget.valueAsNumber
      containerRef.current?.style.setProperty(
        '--inflation',
        String(inflation / 100),
      )
      firmnessRef.current = firmnessFromInflation(inflation)
      dilationRef.current = inflation / 100
      wake()
    },
    [wake],
  )

  return (
    <div className="letters">
      <div
        className="letters__container"
        ref={containerRef}
        style={
          {
            left: ANCHOR_X,
            top: ANCHOR_Y,
            width: sizeRef.current.width,
            height: sizeRef.current.height,
            '--inflation': DEFAULT_INFLATION / 100,
            '--dilation-max': `${MAX_DILATION_PX}px`,
          } as CSSProperties
        }
      >
        <svg
          className="letters__svg"
          width={sizeRef.current.width}
          height={sizeRef.current.height}
        >
          <defs>
            <radialGradient
              id="letters-gloss"
              gradientUnits="objectBoundingBox"
              cx="0.32"
              cy="0.24"
              r="0.55"
            >
              <stop
                offset="0%"
                stopColor="#ffffff"
                style={{ stopOpacity: 'calc(1.1 * var(--inflation, 0.7))' }}
              />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              id="letters-shade"
              gradientUnits="objectBoundingBox"
              x1="0.15"
              y1="0.05"
              x2="0.9"
              y2="1"
            >
              <stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <stop
                offset="100%"
                stopColor="#000000"
                style={{ stopOpacity: 'calc(0.55 * var(--inflation, 0.7))' }}
              />
            </linearGradient>
          </defs>

          {LETTER_CHARS.map((_char, i) => (
            <g
              key={i}
              className="letters__bubble"
              style={{ '--tint': LETTER_COLORS[i] } as CSSProperties}
            >
              <path
                id={`letters-path-${i}`}
                ref={(el) => {
                  pathElsRef.current[i] = el
                }}
                className="letters__fillPath"
                fill={LETTER_COLORS[i]}
                stroke={LETTER_COLORS[i]}
                fillRule="evenodd"
                onPointerDown={handleLetterDown(i)}
                onPointerMove={handleLetterMove}
                onPointerUp={handleLetterUp}
                onPointerCancel={handleLetterUp}
              />
              <use
                href={`#letters-path-${i}`}
                fill="url(#letters-shade)"
                stroke="url(#letters-shade)"
                fillRule="evenodd"
                pointerEvents="none"
              />
              <use
                href={`#letters-path-${i}`}
                fill="url(#letters-gloss)"
                stroke="url(#letters-gloss)"
                fillRule="evenodd"
                pointerEvents="none"
              />
            </g>
          ))}
        </svg>

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

      <div className="letters__controls">
        <label className="letters__control">
          <span className="letters__controlLabel mono">Size</span>
          <input
            type="range"
            className="letters__slider"
            min={MIN_SIZE}
            max={MAX_SIZE}
            defaultValue={BASE_SIZE}
            onChange={handleSizeChange}
          />
        </label>

        <label className="letters__control">
          <span className="letters__controlLabel mono">Inflation</span>
          <input
            type="range"
            className="letters__slider"
            min={0}
            max={100}
            defaultValue={DEFAULT_INFLATION}
            onChange={handleInflationChange}
          />
        </label>
      </div>
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
