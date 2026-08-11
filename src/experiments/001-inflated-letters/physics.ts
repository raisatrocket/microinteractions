/**
 * A small spring-repulsion simulation for the letter bubbles: not
 * force-and-collide-then-snap-apart, but a continuous repulsion proportional
 * to how far two circles (or a circle and a wall) overlap. That distinction
 * is what makes "compress the letters" actually read as compression — under
 * sustained pressure (a shrinking container, say) the letters settle into a
 * genuine overlap where the repulsion force balances the squeeze, rather
 * than always being shoved back to a tidy non-overlapping arrangement.
 *
 * Each letter's collision shape is a small cluster of circles approximating
 * its printed silhouette (a "B" is roughly two lobes and a spine), not one
 * circle spanning the whole glyph — otherwise a narrow "L" would collide as
 * if it were as wide as a "B". The cluster is rigidly attached to the
 * letter: it moves and deforms as one body, and only ever collides against
 * *other* letters' or walls' sub-circles, never against its own.
 *
 * Integration follows the same fixed-substep technique as `lib/spring.ts`,
 * for the same reason: explicit Euler on a stiff spring is only stable when
 * the step is small relative to the spring's natural frequency, and this
 * repulsion is stiffer than anything in that file.
 */

export const LETTER_CHARS = ['B', 'U', 'B', 'B', 'L', 'E'] as const

export const CONTAINER_MIN_WIDTH = 200
export const CONTAINER_MIN_HEIGHT = 150
export const CONTAINER_MAX_WIDTH = 660
export const CONTAINER_MAX_HEIGHT = 440
export const CONTAINER_DEFAULT_WIDTH = 580
export const CONTAINER_DEFAULT_HEIGHT = 320

/**
 * Hand-authored circle-cluster approximations of each glyph's silhouette, as
 * fractions of the glyph's own measured (width, height) — x/y from the
 * top-left, r as a fraction of height so it scales sensibly regardless of a
 * letter's width. Resolved to real pixel offsets once the glyph is actually
 * measured in the browser, since web font metrics can't be known in advance.
 */
const PROPORTIONAL_SHAPES: Record<
  string,
  { x: number; y: number; r: number }[]
> = {
  B: [
    { x: 0.3, y: 0.22, r: 0.2 },
    { x: 0.3, y: 0.78, r: 0.2 },
    { x: 0.4, y: 0.5, r: 0.16 },
    { x: 0.65, y: 0.27, r: 0.25 },
    { x: 0.67, y: 0.75, r: 0.27 },
  ],
  U: [
    { x: 0.22, y: 0.2, r: 0.2 },
    { x: 0.78, y: 0.2, r: 0.2 },
    { x: 0.18, y: 0.55, r: 0.2 },
    { x: 0.82, y: 0.55, r: 0.2 },
    { x: 0.5, y: 0.83, r: 0.24 },
  ],
  L: [
    { x: 0.26, y: 0.18, r: 0.2 },
    { x: 0.26, y: 0.5, r: 0.2 },
    { x: 0.26, y: 0.82, r: 0.2 },
    { x: 0.5, y: 0.83, r: 0.18 },
    { x: 0.74, y: 0.83, r: 0.2 },
  ],
  E: [
    { x: 0.26, y: 0.15, r: 0.18 },
    { x: 0.7, y: 0.15, r: 0.16 },
    { x: 0.26, y: 0.5, r: 0.18 },
    { x: 0.6, y: 0.5, r: 0.15 },
    { x: 0.26, y: 0.85, r: 0.18 },
    { x: 0.7, y: 0.85, r: 0.16 },
  ],
}

export type SubCircle = { dx: number; dy: number; r: number }

export type LetterShape = {
  subCircles: SubCircle[]
  halfWidth: number
  halfHeight: number
}

/** Turns a glyph's real measured size into an actual pixel circle cluster,
 *  offsets relative to the glyph's own center. */
export function resolveLetterShape(
  char: string,
  width: number,
  height: number,
): LetterShape {
  const proportional = PROPORTIONAL_SHAPES[char]
  const subCircles = proportional
    ? proportional.map((c) => ({
        dx: (c.x - 0.5) * width,
        dy: (c.y - 0.5) * height,
        r: c.r * height,
      }))
    : // An unexpected character still collides sensibly instead of crashing.
      [{ dx: 0, dy: 0, r: Math.max(width, height) / 2 }]

  return { subCircles, halfWidth: width / 2, halfHeight: height / 2 }
}

export type Letter = {
  char: string
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
  shape: LetterShape
}

export function createLetter(
  char: string,
  x: number,
  y: number,
  shape: LetterShape,
): Letter {
  return {
    char,
    x,
    y,
    vx: 0,
    vy: 0,
    held: false,
    squish: 0,
    squishAngle: 0,
    shape,
  }
}

const FRICTION = 2.2 // 1/s velocity decay
const WALL_STIFFNESS = 2400 // px/s^2 per px of penetration
const WALL_DAMPING = 18 // 1/s, kills velocity driving further into a wall
const LETTER_STIFFNESS = 2000
const LETTER_DAMPING = 16
const SQUISH_SMOOTH = 14 // 1/s, how fast the visual catches up to real overlap
const MAX_SQUISH = 0.38

/**
 * Backstop fractions, applied per-contact against the radii actually
 * involved, so they scale correctly across a cluster's differently sized
 * sub-circles. Two letters overlapping is contained entirely within the
 * container, so it can be generous — that overlap *is* the compressed
 * look. A sub-circle penetrating a wall is poking through the container's
 * own drawn edge, which reads as a bug rather than pressure, so it stays
 * tight.
 */
const MAX_WALL_PENETRATION_FRACTION = 0.08
const MAX_PAIR_OVERLAP_FRACTION = MAX_SQUISH

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

  // Walls: every sub-circle of every letter is checked independently, so a
  // letter's rightmost lobe can press against the wall while its spine on
  // the far side still has clearance.
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i]
    const c = contact[i]
    for (const sub of l.shape.subCircles) {
      const wx = l.x + sub.dx
      const wy = l.y + sub.dy
      const tolerance = sub.r * MAX_WALL_PENETRATION_FRACTION

      resolveWallSub(l, c, sub.r - wx, 1, 0, dt, tolerance)
      resolveWallSub(l, c, wx - (containerWidth - sub.r), -1, 0, dt, tolerance)
      resolveWallSub(l, c, sub.r - wy, 0, 1, dt, tolerance)
      resolveWallSub(l, c, wy - (containerHeight - sub.r), 0, -1, dt, tolerance)
    }
  }

  // Pairs: every sub-circle combination between every pair of letters. A
  // wide letter with several sub-circles resting against a neighbor
  // legitimately gets several simultaneous contact contributions — that is
  // correct, not double-counted, the same way real distributed contact
  // between two touching shapes works.
  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      const a = letters[i]
      const b = letters[j]
      for (const sa of a.shape.subCircles) {
        const ax = a.x + sa.dx
        const ay = a.y + sa.dy
        for (const sb of b.shape.subCircles) {
          const bx = b.x + sb.dx
          const by = b.y + sb.dy
          const dx = bx - ax
          const dy = by - ay
          const dist = Math.hypot(dx, dy) || 0.0001
          const sumR = sa.r + sb.r
          const overlap = sumR - dist
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

          const excess = overlap - sumR * MAX_PAIR_OVERLAP_FRACTION
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
    }
  }

  const smoothing = 1 - Math.exp(-SQUISH_SMOOTH * dt)
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i]
    const c = contact[i]
    // Normalize by the letter's own scale (half-height), so a big letter and
    // a small letter reach visually comparable squish under comparable
    // relative pressure.
    const target = Math.min(
      Math.pow(c.amount / (l.shape.halfHeight * 2), 0.6),
      MAX_SQUISH,
    )
    l.squish += (target - l.squish) * smoothing
    if (c.amount > 0.001) {
      l.squishAngle = Math.atan2(c.ny, c.nx)
    }
  }
}

/**
 * One wall, for one sub-circle. `nx,ny` points *into* the container (away
 * from the wall). Positional correction is applied to the *letter's*
 * position (not the sub-circle, which has no position of its own) — moving
 * the whole letter by the excess is what pulls the offending sub-circle
 * back within tolerance.
 */
function resolveWallSub(
  l: Letter,
  contact: Contact,
  penetration: number,
  nx: number,
  ny: number,
  dt: number,
  tolerance: number,
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

    const excess = penetration - tolerance
    if (excess > 0) {
      l.x += nx * excess
      l.y += ny * excess
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
