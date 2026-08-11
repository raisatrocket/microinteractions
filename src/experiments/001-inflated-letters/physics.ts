/**
 * A small spring-repulsion simulation for the letter bubbles: not
 * force-and-collide-then-snap-apart, but a continuous repulsion proportional
 * to how far two circles (or a circle and a wall) overlap. That distinction
 * is what makes "compress the letters" actually read as compression — under
 * sustained pressure (a shrinking container, say) the letters settle into a
 * genuine overlap where the repulsion force balances the squeeze, rather
 * than always being shoved back to a tidy non-overlapping arrangement.
 *
 * Integration follows the same fixed-substep technique as `lib/spring.ts`,
 * for the same reason: explicit Euler on a stiff spring is only stable when
 * the step is small relative to the spring's natural frequency, and this
 * repulsion is stiffer than anything in that file.
 */

export const LETTER_CHARS = ['B', 'U', 'B', 'B', 'L', 'E'] as const

export const LETTER_DIAMETER = 76
export const LETTER_RADIUS = LETTER_DIAMETER / 2

export const CONTAINER_MIN_WIDTH = 220
export const CONTAINER_MIN_HEIGHT = 168
export const CONTAINER_MAX_WIDTH = 620
export const CONTAINER_MAX_HEIGHT = 420
export const CONTAINER_DEFAULT_WIDTH = 520
export const CONTAINER_DEFAULT_HEIGHT = 320

export type Letter = {
  x: number
  y: number
  vx: number
  vy: number
  held: boolean
  /** 0 (round) to 1 (fully flattened) — always the *current* overlap, not a
   *  decaying memory of a past impact, so it tracks sustained pressure. */
  squish: number
  /** Radians; direction of whatever is compressing this letter hardest. */
  squishAngle: number
}

export function createLetter(x: number, y: number): Letter {
  return { x, y, vx: 0, vy: 0, held: false, squish: 0, squishAngle: 0 }
}

const FRICTION = 2.2 // 1/s velocity decay
const WALL_STIFFNESS = 2400 // px/s^2 per px of penetration
const WALL_DAMPING = 18 // 1/s, kills velocity driving further into a wall
const LETTER_STIFFNESS = 2000
const LETTER_DAMPING = 16
const SQUISH_SMOOTH = 14 // 1/s, how fast the visual catches up to real overlap
const MAX_SQUISH = 0.38

/**
 * Absolute ceilings on penetration, regardless of spring stiffness — a fast
 * fling can out-run the spring for a frame or two, and these are the
 * backstops that guarantee correctness. The two are intentionally different:
 * two letters overlapping each other is contained entirely within the
 * container, so it can be generous (that overlap *is* the compressed look,
 * and it persists structurally for as long as the box stays small — no
 * separate decay needed). A letter penetrating a wall is a letter poking
 * through the container's own drawn edge, which reads as a bug rather than
 * pressure, so that one stays tight.
 */
const MAX_WALL_PENETRATION = 3
const MAX_PAIR_OVERLAP = LETTER_DIAMETER * MAX_SQUISH

const SUBSTEP = 1 / 480
const MAX_FRAME = 1 / 30

type Contact = { amount: number; nx: number; ny: number }

/**
 * Advances the simulation by `rawDt` seconds (already multiplied by the
 * playback speed). Mutates `letters` in place. Returns whether anything is
 * still in motion, so the caller can stop the animation loop at rest.
 */
export function stepPhysics(
  letters: Letter[],
  containerWidth: number,
  containerHeight: number,
  rawDt: number,
): boolean {
  let remaining = Math.min(rawDt, MAX_FRAME)
  while (remaining > 0) {
    const h = Math.min(remaining, SUBSTEP)
    substep(letters, containerWidth, containerHeight, h)
    remaining -= h
  }
  return hasEnergy(letters)
}

function substep(
  letters: Letter[],
  containerWidth: number,
  containerHeight: number,
  dt: number,
): void {
  const frictionFactor = Math.exp(-FRICTION * dt)
  for (const l of letters) {
    if (l.held) continue
    l.x += l.vx * dt
    l.y += l.vy * dt
    l.vx *= frictionFactor
    l.vy *= frictionFactor
  }

  const contact: Contact[] = letters.map(() => ({ amount: 0, nx: 0, ny: 0 }))

  const minX = LETTER_RADIUS
  const maxX = Math.max(containerWidth - LETTER_RADIUS, minX)
  const minY = LETTER_RADIUS
  const maxY = Math.max(containerHeight - LETTER_RADIUS, minY)

  for (let i = 0; i < letters.length; i++) {
    const l = letters[i]
    const c = contact[i]

    resolveWall(l, c, minX - l.x, 1, 0, dt, (v) => {
      l.x = minX - v
    })
    resolveWall(l, c, l.x - maxX, -1, 0, dt, (v) => {
      l.x = maxX + v
    })
    resolveWall(l, c, minY - l.y, 0, 1, dt, (v) => {
      l.y = minY - v
    })
    resolveWall(l, c, l.y - maxY, 0, -1, dt, (v) => {
      l.y = maxY + v
    })
  }

  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      const a = letters[i]
      const b = letters[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 0.0001
      const overlap = LETTER_DIAMETER - dist
      if (overlap <= 0) continue

      const nx = dx / dist
      const ny = dy / dist
      const accel = LETTER_STIFFNESS * overlap

      if (!a.held) {
        a.vx -= nx * accel * dt
        a.vy -= ny * accel * dt
      }
      if (!b.held) {
        b.vx += nx * accel * dt
        b.vy += ny * accel * dt
      }

      // Damp the closing speed along the contact normal so pairs settle
      // instead of bouncing indefinitely.
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
      if (closing > 0) {
        const damp = Math.min(LETTER_DAMPING * dt, 1) * closing
        if (!a.held) {
          a.vx -= nx * damp * 0.5
          a.vy -= ny * damp * 0.5
        }
        if (!b.held) {
          b.vx += nx * damp * 0.5
          b.vy += ny * damp * 0.5
        }
      }

      // Hard backstop: never let two letters interpenetrate past the cap,
      // regardless of how the spring above is tracking.
      const excess = overlap - MAX_PAIR_OVERLAP
      if (excess > 0) {
        const push = excess / 2
        if (!a.held) {
          a.x -= nx * push
          a.y -= ny * push
        }
        if (!b.held) {
          b.x += nx * push
          b.y += ny * push
        }
      }

      contact[i].amount += overlap
      contact[i].nx -= nx
      contact[i].ny -= ny
      contact[j].amount += overlap
      contact[j].nx += nx
      contact[j].ny += ny
    }
  }

  const smoothing = 1 - Math.exp(-SQUISH_SMOOTH * dt)
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i]
    const c = contact[i]
    const target = Math.min(
      Math.pow(c.amount / LETTER_DIAMETER, 0.6),
      MAX_SQUISH,
    )
    l.squish += (target - l.squish) * smoothing
    if (c.amount > 0.001) {
      l.squishAngle = Math.atan2(c.ny, c.nx)
    }
  }
}

/**
 * One wall. `nx,ny` points *into* the container (away from the wall).
 * `setClamped` receives the backstop penetration to clamp the position to,
 * measured from the wall.
 */
function resolveWall(
  l: Letter,
  contact: Contact,
  penetration: number,
  nx: number,
  ny: number,
  dt: number,
  setClamped: (backstopPenetration: number) => void,
): void {
  if (penetration <= 0) return

  if (!l.held) {
    const accel = WALL_STIFFNESS * penetration
    l.vx += nx * accel * dt
    l.vy += ny * accel * dt

    const into = -(l.vx * nx + l.vy * ny)
    if (into > 0) {
      const damp = Math.min(WALL_DAMPING * dt, 1) * into
      l.vx += nx * damp
      l.vy += ny * damp
    }

    if (penetration > MAX_WALL_PENETRATION) {
      setClamped(MAX_WALL_PENETRATION)
    }
  }

  contact.amount += penetration
  contact.nx += nx
  contact.ny += ny
}

const REST_SPEED = 0.6
const REST_SQUISH_DELTA = 0.001

function hasEnergy(letters: Letter[]): boolean {
  for (const l of letters) {
    if (l.held) return true
    if (Math.abs(l.vx) > REST_SPEED || Math.abs(l.vy) > REST_SPEED) return true
    if (l.squish > REST_SQUISH_DELTA) return true
  }
  return false
}
