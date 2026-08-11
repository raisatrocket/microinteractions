import { useCallback, useState } from 'react'

import type { StageControls } from './StageChrome'

const SPEEDS = [1, 0.5, 0.25]

export type StageControlState = StageControls & {
  /** Feed this to <Stage runId> — bumping it remounts the experiment. */
  runId: number
}

/** The state behind the window chrome, shared by the timeline and embeds. */
export function useStageControls(): StageControlState {
  const [speed, setSpeed] = useState(1)
  const [grid, setGrid] = useState(false)
  const [runId, setRunId] = useState(0)

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length]
      return next ?? 1
    })
  }, [])

  const toggleGrid = useCallback(() => setGrid((value) => !value), [])
  const replay = useCallback(() => setRunId((value) => value + 1), [])

  return { speed, grid, runId, cycleSpeed, toggleGrid, replay }
}
