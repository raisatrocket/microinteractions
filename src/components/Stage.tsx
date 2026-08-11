import { Suspense, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { StageContext } from '../stage/stage-context'
import type { StageContextValue } from '../stage/stage-context'
import './stage.css'

export const STAGE_WIDTH = 800
export const STAGE_HEIGHT = 600

type StageProps = {
  /** How much to shrink the 800x600 surface to fit its container. */
  scale: number
  /** Playback multiplier: 1, 0.5, 0.25. */
  speed: number
  grid: boolean
  /** Changing this remounts the experiment — that is the replay button. */
  runId: number
  children: ReactNode
}

/**
 * The 800x600 surface itself, with nothing around it.
 *
 * Positioned absolutely at its container's top-left, so callers control
 * placement by sizing that container to `800 * scale` x `600 * scale`.
 * Shared by the timeline windows and the standalone embed route, which is what
 * keeps an embedded experiment pixel-identical to the one on the log.
 */
export default function Stage({
  scale,
  speed,
  grid,
  runId,
  children,
}: StageProps) {
  const timeScaleRef = useRef(speed)
  const scaleRef = useRef(scale)
  timeScaleRef.current = speed
  scaleRef.current = scale

  const context = useMemo<StageContextValue>(
    () => ({ timeScale: timeScaleRef, scale: scaleRef }),
    [],
  )

  return (
    <div
      className="stage"
      style={
        {
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `scale(${scale})`,
          '--mi-t': speed,
        } as CSSProperties
      }
    >
      <StageContext.Provider value={context}>
        <div className="stage__mount" key={runId}>
          <Suspense fallback={<div className="stage__loading" aria-hidden="true" />}>
            {children}
          </Suspense>
        </div>
      </StageContext.Provider>

      {grid ? <div className="stage__grid" aria-hidden="true" /> : null}
    </div>
  )
}
