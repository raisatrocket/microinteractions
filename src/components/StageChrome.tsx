import './stage-chrome.css'

export type StageControls = {
  speed: number
  grid: boolean
  cycleSpeed: () => void
  toggleGrid: () => void
  replay: () => void
}

type Props = StageControls & {
  /** "001". Omitted on embeds, where the timeline position means nothing. */
  index?: string
  title: string
  /** The "800 × 600" readout is noise in a small embed. */
  showDimensions?: boolean
}

export default function StageChrome({
  index,
  title,
  showDimensions = true,
  speed,
  grid,
  cycleSpeed,
  toggleGrid,
  replay,
}: Props) {
  return (
    <div className="chrome">
      <div className="chrome__id">
        <span className="chrome__dot" aria-hidden="true" />
        {index ? <span className="mono">{index}</span> : null}
        <span className="chrome__name">{title}</span>
      </div>

      <div className="chrome__tools">
        {showDimensions ? (
          <span className="chrome__dims mono" aria-hidden="true">
            800 × 600
          </span>
        ) : null}

        <button
          type="button"
          className="chrome__tool"
          onClick={cycleSpeed}
          aria-label={`Playback speed, currently ${speed}×. Click to change.`}
          data-active={speed !== 1 || undefined}
        >
          <span className="mono">{speed}×</span>
        </button>

        <button
          type="button"
          className="chrome__tool"
          onClick={toggleGrid}
          aria-label="Toggle 8px grid overlay"
          aria-pressed={grid}
          data-active={grid || undefined}
        >
          <GridIcon />
        </button>

        <button
          type="button"
          className="chrome__tool"
          onClick={replay}
          aria-label="Replay experiment"
        >
          <ReplayIcon />
        </button>
      </div>
    </div>
  )
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
