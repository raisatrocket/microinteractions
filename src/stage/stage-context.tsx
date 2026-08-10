import { createContext, useContext } from 'react'
import type { RefObject } from 'react'

/**
 * Every experiment renders inside a Window, which publishes two live values
 * through this context. Both are refs rather than plain numbers so that
 * requestAnimationFrame loops can read the current value without
 * re-subscribing on every change.
 */
export type StageContextValue = {
  /** Playback multiplier. 1 = realtime, 0.25 = quarter speed. */
  timeScale: RefObject<number>
  /**
   * How much the 800x600 stage is visually scaled to fit the viewport.
   * Divide viewport-space pointer deltas by this to get stage-space units.
   */
  scale: RefObject<number>
}

export const StageContext = createContext<StageContextValue | null>(null)

export function useStage(): StageContextValue {
  const ctx = useContext(StageContext)
  if (!ctx) {
    throw new Error('useStage() must be called inside a <Window>')
  }
  return ctx
}

/** Live playback multiplier, for JS-driven animation and timers. */
export function useTimeScale(): RefObject<number> {
  return useStage().timeScale
}

/** Live stage scale factor, for converting pointer coordinates. */
export function useStageScale(): RefObject<number> {
  return useStage().scale
}
