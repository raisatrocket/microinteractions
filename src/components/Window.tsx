import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { StageContext } from '../stage/stage-context'
import type { StageContextValue } from '../stage/stage-context'
import './window.css'

export const STAGE_WIDTH = 800
export const STAGE_HEIGHT = 600

const SPEEDS = [1, 0.5, 0.25] as const

type WindowProps = {
  /** Zero-padded position in the timeline, e.g. "001". */
  index: string
  title: string
  children: ReactNode
}

/**
 * The 800x600 stage every experiment is built inside, plus the chrome that
 * makes it a workbench: replay, playback speed, and an 8px grid overlay.
 *
 * The stage is always exactly 800x600 in its own coordinate space. When the
 * viewport is narrower it is scaled down with a transform, and the scale factor
 * is published on the context so pointer maths can convert back to stage units.
 */
export default function Window({ index, title, children }: WindowProps) {
  const frameRef = useRef<HTMLDivElement>(null)

  const [scale, setScale] = useState(1)
  const [speed, setSpeed] = useState<number>(1)
  const [grid, setGrid] = useState(false)
  const [runId, setRunId] = useState(0)
  const [mounted, setMounted] = useState(false)

  const timeScaleRef = useRef(1)
  const scaleRef = useRef(1)
  timeScaleRef.current = speed
  scaleRef.current = scale

  const stage = useMemo<StageContextValue>(
    () => ({ timeScale: timeScaleRef, scale: scaleRef }),
    [],
  )

  // Keep the 800x600 stage fitted to whatever width the frame ended up with.
  // The frame itself is sized by CSS aspect-ratio, so this never shifts layout.
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

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = SPEEDS[(SPEEDS.indexOf(current as never) + 1) % SPEEDS.length]
      return next ?? 1
    })
  }, [])

  const replay = useCallback(() => setRunId((n) => n + 1), [])

  return (
    <div className="win">
      <div className="win__chrome">
        <div className="win__id">
          <span className="win__dot" aria-hidden="true" />
          <span className="mono">{index}</span>
          <span className="win__name">{title}</span>
        </div>

        <div className="win__tools">
          <span className="win__dims mono" aria-hidden="true">
            800 × 600
          </span>

          <button
            type="button"
            className="win__tool"
            onClick={cycleSpeed}
            aria-label={`Playback speed, currently ${speed}×. Click to change.`}
            data-active={speed !== 1 || undefined}
          >
            <span className="mono">{speed}×</span>
          </button>

          <button
            type="button"
            className="win__tool"
            onClick={() => setGrid((g) => !g)}
            aria-label="Toggle 8px grid overlay"
            aria-pressed={grid}
            data-active={grid || undefined}
          >
            <GridIcon />
          </button>

          <button
            type="button"
            className="win__tool"
            onClick={replay}
            aria-label="Replay experiment"
          >
            <ReplayIcon />
          </button>
        </div>
      </div>

      <div className="win__frame" ref={frameRef} data-grid={grid || undefined}>
        <div
          className="win__stage"
          style={
            {
              width: STAGE_WIDTH,
              height: STAGE_HEIGHT,
              transform: `scale(${scale})`,
              '--mi-t': speed,
            } as CSSProperties
          }
        >
          <StageContext.Provider value={stage}>
            <div className="win__mount" key={runId}>
              {mounted ? (
                <Suspense fallback={<StageLoading />}>{children}</Suspense>
              ) : null}
            </div>
          </StageContext.Provider>
        </div>

        {grid ? <div className="win__grid" aria-hidden="true" /> : null}
      </div>
    </div>
  )
}

function StageLoading() {
  return <div className="win__loading" aria-hidden="true" />
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1 5h12M1 9h12M5 1v12M9 1v12"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ReplayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M12 7a5 5 0 1 1-1.6-3.66"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12.4 1.4v3h-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
