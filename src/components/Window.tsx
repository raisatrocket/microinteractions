import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import Stage from './Stage'
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
 * A stage on the timeline: chrome on top, then the 800x600 surface at its
 * true pixel size — never scaled down. On a narrower viewport the frame
 * scrolls horizontally instead of shrinking, so nothing inside an experiment
 * (a button, a knob) ever renders smaller on mobile than on desktop.
 */
export default function Window({ index, title, children }: WindowProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const controls = useStageControls()

  // Experiments generally center their content, so on a narrow frame — where
  // the 800px-wide stage overflows and only scrolls into view a piece at a
  // time — start centered rather than pinned to the left edge, so the thing
  // to interact with is visible without scrolling first.
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const center = () => {
      frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2
    }

    center()
    const observer = new ResizeObserver(center)
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
          scale={1}
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
