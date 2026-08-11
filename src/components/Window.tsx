import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import Stage, { STAGE_WIDTH } from './Stage'
import StageChrome from './StageChrome'
import { useStageControls } from './useStageControls'
import './window.css'

type WindowProps = {
  /** Zero-padded position in the timeline, e.g. "001". */
  index: string
  title: string
  children: ReactNode
}

/**
 * A stage on the timeline: chrome on top, then the 800x600 surface fitted to
 * whatever width the column gives it.
 */
export default function Window({ index, title, children }: WindowProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [mounted, setMounted] = useState(false)
  const controls = useStageControls()

  // The frame is sized by CSS aspect-ratio, so measuring it never shifts
  // layout — which is what lets a deep link land accurately on first paint.
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = () => {
      const width = frame.clientWidth
      if (width > 0) setScale(width / STAGE_WIDTH)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // Only build an experiment once the reader is close to it. Timeline pages get
  // long, and there is no reason for experiment 012 to be running at the top.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true)
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="win">
      <StageChrome index={index} title={title} {...controls} />

      <div className="win__frame" ref={frameRef}>
        <Stage
          scale={scale}
          speed={controls.speed}
          grid={controls.grid}
          runId={controls.runId}
        >
          {mounted ? children : null}
        </Stage>
      </div>
    </div>
  )
}
