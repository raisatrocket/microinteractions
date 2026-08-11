import { useCallback, useEffect, useRef, useState } from 'react'

import { SPRINGS, useSpringValue } from '../../lib/spring'
import { clamp } from '../../lib/util'
import './style.css'

/** Distance the knob travels, in stage units. */
const TRAVEL = 46
/** Velocity that maps to maximum deformation. */
const VELOCITY_FOR_FULL_STRETCH = 900
/** Cap, or the knob turns into a smear. */
const MAX_STRETCH = 0.3
/** Volume is roughly preserved: what it gains wide it gives back in height. */
const SQUASH_RATIO = 0.62

export default function ElasticToggle() {
  const rootRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLSpanElement>(null)
  const [on, setOn] = useState(false)

  const setPosition = useSpringValue(0, SPRINGS.bouncy, (x, velocity) => {
    const knob = knobRef.current
    if (!knob) return

    const stretch = clamp(
      Math.abs(velocity) / VELOCITY_FOR_FULL_STRETCH,
      0,
      MAX_STRETCH,
    )

    // Stretch along the direction of travel, squash across it.
    knob.style.transform = `translateX(${x}px) scaleX(${1 + stretch}) scaleY(${
      1 - stretch * SQUASH_RATIO
    })`

    // Drive the read-out from the same number the deformation uses, so the
    // instrument can never disagree with what you are looking at.
    rootRef.current?.style.setProperty(
      '--velocity',
      (stretch / MAX_STRETCH).toFixed(3),
    )
  })

  useEffect(() => {
    setPosition(on ? TRAVEL : 0)
  }, [on, setPosition])

  const toggle = useCallback(() => setOn((value) => !value), [])

  return (
    <div className="elastic" ref={rootRef}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Elastic toggle"
        className="elastic__track"
        data-on={on || undefined}
        onClick={toggle}
      >
        <span className="elastic__knob" ref={knobRef} />
      </button>

      <div className="elastic__readout">
        <div className="elastic__meter" aria-hidden="true">
          <span className="elastic__meterFill" />
        </div>
        <p className="elastic__caption mono">knob velocity → deformation</p>
      </div>
    </div>
  )
}
