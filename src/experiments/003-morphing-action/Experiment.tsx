import { useCallback, useState } from 'react'

import { useScaledTimeout } from '../../lib/spring'
import './style.css'

type State = 'idle' | 'pending' | 'done'

/** Stage units. The pill collapses to a disc, then reopens around the result. */
const WIDTHS: Record<State, number> = {
  idle: 186,
  pending: 52,
  done: 148,
}

const PENDING_MS = 1400
const DONE_MS = 1700

export default function MorphingAction() {
  const [state, setState] = useState<State>('idle')
  const schedule = useScaledTimeout()

  const run = useCallback(() => {
    // Ignore presses mid-flight rather than disabling the button — a disabled
    // control drops focus and kills its own hover state.
    if (state !== 'idle') return

    setState('pending')
    schedule(() => {
      setState('done')
      schedule(() => setState('idle'), DONE_MS)
    }, PENDING_MS)
  }, [schedule, state])

  return (
    <div className="morph">
      <button
        type="button"
        className="morph__button"
        data-state={state}
        style={{ width: WIDTHS[state] }}
        onClick={run}
        aria-busy={state === 'pending'}
      >
        <span className="morph__layer" data-layer="idle">
          Save changes
        </span>

        <span className="morph__layer" data-layer="pending">
          <Spinner />
        </span>

        <span className="morph__layer" data-layer="done">
          <Check />
          Saved
        </span>
      </button>

      <p className="morph__caption mono" aria-live="polite">
        {state}
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="morph__spinner"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="2"
      />
      <path
        d="M18 10a8 8 0 0 0-8-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Check() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        className="morph__check"
        d="M3.6 9.4l3.5 3.5 7-7.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
