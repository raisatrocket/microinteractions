import { useCallback, useEffect, useRef } from 'react'

import { useTimeScale } from '../stage/stage-context'

export type SpringConfig = {
  stiffness: number
  damping: number
  mass: number
}

/**
 * A small vocabulary of springs. Naming them keeps experiments readable and
 * makes it obvious when two interactions are meant to feel the same.
 */
export const SPRINGS = {
  /** Slow, no overshoot. Good for large surfaces. */
  gentle: { stiffness: 120, damping: 20, mass: 1 },
  /** Quick and settled. The default for pointer follow. */
  snappy: { stiffness: 340, damping: 26, mass: 1 },
  /** Visible overshoot. Use where the bounce is the point. */
  bouncy: { stiffness: 460, damping: 18, mass: 1 },
  /** Near-instant, still physical. Good for small state flips. */
  stiff: { stiffness: 800, damping: 44, mass: 1 },
} as const satisfies Record<string, SpringConfig>

/** A frame longer than this is treated as a pause (tab switch, jank). */
const MAX_FRAME = 1 / 30
/** Fixed integration step, so behaviour is framerate-independent. */
const SUBSTEP = 1 / 480

const REST_DISTANCE = 0.002
const REST_VELOCITY = 0.02

type Axis = { value: number; velocity: number; target: number }

function integrate(axis: Axis, seconds: number, config: SpringConfig): void {
  let remaining = seconds
  while (remaining > 0) {
    const h = Math.min(remaining, SUBSTEP)
    const acceleration =
      (-config.stiffness * (axis.value - axis.target) -
        config.damping * axis.velocity) /
      config.mass
    axis.velocity += acceleration * h
    axis.value += axis.velocity * h
    remaining -= h
  }
}

function atRest(axis: Axis): boolean {
  return (
    Math.abs(axis.value - axis.target) < REST_DISTANCE &&
    Math.abs(axis.velocity) < REST_VELOCITY
  )
}

type ScalarFrame = (value: number, velocity: number) => void

/**
 * A spring-driven scalar.
 *
 * The returned setter moves the target; `onFrame` is called on every animation
 * frame with the current value and velocity. Nothing here touches React state,
 * so the loop never re-renders — write straight to the DOM from `onFrame`.
 *
 * Velocity is handed to you on purpose: driving squash-and-stretch from it is
 * what separates a spring that merely moves from one that feels like matter.
 */
export function useSpringValue(
  initial: number,
  config: SpringConfig,
  onFrame: ScalarFrame,
): (target: number) => void {
  const timeScale = useTimeScale()

  const axis = useRef<Axis>({ value: initial, velocity: 0, target: initial })
  const configRef = useRef(config)
  const frameRef = useRef(onFrame)
  const rafRef = useRef(0)
  const lastRef = useRef(0)

  configRef.current = config
  frameRef.current = onFrame

  const tick = useCallback(
    (now: number) => {
      const seconds =
        Math.min((now - lastRef.current) / 1000, MAX_FRAME) * timeScale.current
      lastRef.current = now

      integrate(axis.current, seconds, configRef.current)

      if (atRest(axis.current)) {
        axis.current.value = axis.current.target
        axis.current.velocity = 0
        rafRef.current = 0
        frameRef.current(axis.current.value, 0)
        return
      }

      frameRef.current(axis.current.value, axis.current.velocity)
      rafRef.current = requestAnimationFrame(tick)
    },
    [timeScale],
  )

  const set = useCallback(
    (target: number) => {
      axis.current.target = target
      if (rafRef.current) return
      lastRef.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    },
    [tick],
  )

  // Paint the resting state once so the element starts where it belongs.
  useEffect(() => {
    frameRef.current(axis.current.value, 0)
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  return set
}

export type Vec2 = { x: number; y: number }

type Vec2Frame = (position: Vec2, velocity: Vec2) => void

/**
 * Two independent springs sharing one animation frame. Used for anything that
 * follows a pointer.
 */
export function useSpring2D(
  initial: Vec2,
  config: SpringConfig,
  onFrame: Vec2Frame,
): (target: Vec2) => void {
  const timeScale = useTimeScale()

  const x = useRef<Axis>({ value: initial.x, velocity: 0, target: initial.x })
  const y = useRef<Axis>({ value: initial.y, velocity: 0, target: initial.y })
  const configRef = useRef(config)
  const frameRef = useRef(onFrame)
  const rafRef = useRef(0)
  const lastRef = useRef(0)

  configRef.current = config
  frameRef.current = onFrame

  const tick = useCallback(
    (now: number) => {
      const seconds =
        Math.min((now - lastRef.current) / 1000, MAX_FRAME) * timeScale.current
      lastRef.current = now

      integrate(x.current, seconds, configRef.current)
      integrate(y.current, seconds, configRef.current)

      if (atRest(x.current) && atRest(y.current)) {
        x.current.value = x.current.target
        y.current.value = y.current.target
        x.current.velocity = 0
        y.current.velocity = 0
        rafRef.current = 0
        frameRef.current(
          { x: x.current.value, y: y.current.value },
          { x: 0, y: 0 },
        )
        return
      }

      frameRef.current(
        { x: x.current.value, y: y.current.value },
        { x: x.current.velocity, y: y.current.velocity },
      )
      rafRef.current = requestAnimationFrame(tick)
    },
    [timeScale],
  )

  const set = useCallback(
    (target: Vec2) => {
      x.current.target = target.x
      y.current.target = target.y
      if (rafRef.current) return
      lastRef.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    },
    [tick],
  )

  useEffect(() => {
    frameRef.current(
      { x: x.current.value, y: y.current.value },
      { x: 0, y: 0 },
    )
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  return set
}

/**
 * setTimeout that respects the window's playback speed, so choreography stays
 * in sync with the springs when you drop to quarter speed.
 */
export function useScaledTimeout(): (fn: () => void, ms: number) => () => void {
  const timeScale = useTimeScale()
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(
    () => () => {
      for (const id of timers.current) clearTimeout(id)
      timers.current.clear()
    },
    [],
  )

  return useCallback(
    (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.current.delete(id)
        fn()
      }, ms / Math.max(timeScale.current, 0.01))
      timers.current.add(id)
      return () => {
        clearTimeout(id)
        timers.current.delete(id)
      }
    },
    [timeScale],
  )
}
