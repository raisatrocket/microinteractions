import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import Stage, { STAGE_HEIGHT, STAGE_WIDTH } from '../components/Stage'
import StageChrome from '../components/StageChrome'
import { useStageControls } from '../components/useStageControls'
import { findExperiment } from '../experiments/registry'
import './embed.css'

/**
 * The standalone route behind `/embed/<slug>`, for dropping a single
 * experiment into another site inside an iframe.
 *
 * No timeline, no page chrome, no copy — just the stage, scaled to fill
 * whatever box the host gives it. Add `?chrome=1` to keep the replay, speed,
 * and grid controls.
 */
export default function EmbedPage() {
  const slug = window.location.pathname
    .replace(/^\/+embed\/+/, '')
    .replace(/\/+$/, '')
  const experiment = findExperiment(slug)

  const showChrome = new URLSearchParams(window.location.search).get('chrome') === '1'

  const fitRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const controls = useStageControls()

  // Fit rather than fill: the stage is scaled by whichever axis is tighter, so
  // the composition is never cropped whatever aspect ratio the host iframe has.
  useLayoutEffect(() => {
    const fit = fitRef.current
    if (!fit) return

    const measure = () => {
      const { clientWidth, clientHeight } = fit
      if (clientWidth <= 0 || clientHeight <= 0) return
      setScale(
        Math.min(clientWidth / STAGE_WIDTH, clientHeight / STAGE_HEIGHT),
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(fit)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    document.title = experiment
      ? `${experiment.title} — Microinteractions`
      : 'Not found — Microinteractions'
  }, [experiment])

  if (!experiment) {
    return (
      <div className="embed embed--empty">
        <p className="mono">No experiment at /{slug}</p>
      </div>
    )
  }

  const { title, Component } = experiment

  return (
    <div className="embed">
      {showChrome ? (
        <StageChrome title={title} showDimensions={false} {...controls} />
      ) : null}

      <div className="embed__fit" ref={fitRef}>
        <div
          className="embed__box"
          style={{ width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale }}
        >
          <Stage
            scale={scale}
            speed={controls.speed}
            grid={controls.grid}
            runId={controls.runId}
          >
            <Component />
          </Stage>
        </div>
      </div>
    </div>
  )
}
