import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { SPRINGS, useSpring2D } from '../../lib/spring'
import { clamp, hypot } from '../../lib/util'
import { useStageScale } from '../../stage/stage-context'
import './style.css'

/** Radius of the magnetic field, in stage units. */
const RADIUS = 190
/** Fraction of the pointer offset the button travels at full strength. */
const PULL = 0.42
/** Hard cap so the button never wanders off its own footprint. */
const MAX_PULL = 46
/** The label travels further than the surface — that gap reads as depth. */
const LABEL_PARALLAX = 0.38

export default function MagneticButton() {
  const rootRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  const stageScale = useStageScale()
  const [pressed, setPressed] = useState(false)

  const setPull = useSpring2D({ x: 0, y: 0 }, SPRINGS.snappy, ({ x, y }) => {
    if (buttonRef.current) {
      buttonRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    if (labelRef.current) {
      labelRef.current.style.transform = `translate3d(${
        x * LABEL_PARALLAX
      }px, ${y * LABEL_PARALLAX}px, 0)`
    }
  })

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const anchor = anchorRef.current
      const root = rootRef.current
      if (!anchor || !root) return

      // Measure the anchor, not the button: the button is already translated by
      // the spring, and measuring it would feed its own output back in.
      const rect = anchor.getBoundingClientRect()
      const scale = stageScale.current || 1

      const dx = (event.clientX - (rect.left + rect.width / 2)) / scale
      const dy = (event.clientY - (rect.top + rect.height / 2)) / scale

      const distance = hypot(dx, dy)
      const proximity = 1 - clamp(distance / RADIUS, 0, 1)

      root.style.setProperty('--proximity', proximity.toFixed(3))

      if (proximity <= 0) {
        setPull({ x: 0, y: 0 })
        return
      }

      // Easing the strength by proximity means the pull fades in at the edge of
      // the field instead of snapping on.
      const strength = PULL * proximity
      const magnitude = Math.min(distance * strength, MAX_PULL)
      const unit = distance === 0 ? 0 : magnitude / distance

      setPull({ x: dx * unit, y: dy * unit })
    },
    [setPull, stageScale],
  )

  const release = useCallback(() => {
    rootRef.current?.style.setProperty('--proximity', '0')
    setPressed(false)
    setPull({ x: 0, y: 0 })
  }, [setPull])

  return (
    <div
      className="mag"
      ref={rootRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={release}
    >
      <div className="mag__anchor" ref={anchorRef}>
        <div
          className="mag__field"
          style={{ width: RADIUS * 2, height: RADIUS * 2 }}
          aria-hidden="true"
        />

        <button
          type="button"
          className="mag__button"
          ref={buttonRef}
          data-pressed={pressed || undefined}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
        >
          <span className="mag__surface">
            <span className="mag__label" ref={labelRef}>
              Get started
              <ArrowIcon />
            </span>
          </span>
        </button>
      </div>

      <p className="mag__hint">Move toward the button</p>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
