/**
 * A real soft body per letter, not a rigid cluster with one global squash
 * transform. Each letter's outline is a ring of connected point-masses that
 * genuinely deform locally — press on one lobe of a "B" and that lobe alone
 * gives, while the rest of the letter barely notices — held together by two
 * forces:
 *
 *  - Shape matching: each point is pulled toward where it "should" be, given
 *    the shape's current center and best-fit rotation (a standard, stable
 *    alternative to true pressure-based inflation — Müller et al.'s meshless
 *    shape matching, restricted to 2D rotation). This is what keeps a
 *    squeezed letter recognizable as that letter instead of collapsing into
 *    a blob, while still allowing real local give.
 *  - Edge springs between consecutive boundary points, keeping the outline
 *    locally taut so it doesn't self-intersect or go spiky under uneven
 *    contact.
 *
 * Collision is boundary-point-to-boundary-point between different letters
 * (each point a small circle) plus per-point wall checks, both using a
 * repulsion-with-a-hard-backstop technique: a soft spring resists overlap,
 * and a direct positional correction on top of that caps how deep any
 * pair is ever allowed to interpenetrate, so contact reads as two solid
 * things pushing against each other rather than one sinking into the
 * other. A held letter's center also only chases the pointer at a capped
 * speed rather than teleporting to it — otherwise a fast enough drag could
 * move a letter's boundary past a neighbor's between one substep and the
 * next, tunneling through it before collision ever saw an overlap.
 *
 * Integration uses the same fixed-substep technique as lib/spring.ts, for
 * the same reason: these springs are stiffer than the natural frequency a
 * single real-time step can resolve.
 */

import { LETTER_OUTLINES } from './outlines'
import type { Vec } from './outlines'

export const LETTER_CHARS = ['B', 'U', 'B', 'B', 'L', 'E'] as const

// Six letters at BASE_SIZE physically cannot pack into a box much smaller
// than this without overlapping — since overlap is never allowed (see
// substep()'s collision pass), the minimum has to be a size that's
// actually achievable, not an arbitrary small number.
export const CONTAINER_MIN_WIDTH = 420
export const CONTAINER_MIN_HEIGHT = 260
export const CONTAINER_MAX_WIDTH = 680
export const CONTAINER_MAX_HEIGHT = 400
export const CONTAINER_DEFAULT_WIDTH = 640
export const CONTAINER_DEFAULT_HEIGHT = 320

/** The glyph height (in px) the size slider's default reproduces. */
export const BASE_SIZE = 106
export const MIN_SIZE = 64
export const MAX_SIZE = 158

type Node = {
  x: number
  y: number
  vx: number
  vy: number
  /** Offset from the shape's own rest center, in its unrotated rest frame —
   *  what shape matching pulls this point back toward. */
  restX: number
  restY: number
}

export type Letter = {
  char: string
  outer: Node[]
  /** Not simulated — carried rigidly by the fitted (center, angle) each
   *  frame, since holes only need to read correctly, not collide. */
  holeRest: Vec[][]
  /** Current best-fit rest-edge length per outer edge i -> i+1, recomputed
   *  whenever the letter is rescaled. */
  restEdgeLength: number[]
  nodeRadius: number
  boundingRadius: number
  held: boolean
  /** Where the pointer wants the shape's center to be, while held. */
  targetX: number
  targetY: number
  // Derived once per substep:
  cx: number
  cy: number
  angle: number
}

/** Builds a letter centered at (x, y), sized so its outline spans roughly
 *  `size` px tall — the same "size" the size slider controls. */
export function createLetter(
  char: string,
  x: number,
  y: number,
  size: number,
): Letter {
  const outline = LETTER_OUTLINES[char]
  const { restOffsets, restCenter } = centerOutline(outline.outer)

  const outer: Node[] = outline.outer.map((_, i) => {
    const rx = restOffsets[i].x * size
    const ry = restOffsets[i].y * size
    return { x: x + rx, y: y + ry, vx: 0, vy: 0, restX: rx, restY: ry }
  })

  const holeRest = outline.holes.map((hole) =>
    hole.map((p) => ({
      x: (p.x - restCenter.x) * size,
      y: (p.y - restCenter.y) * size,
    })),
  )

  return {
    char,
    outer,
    holeRest,
    restEdgeLength: computeEdgeLengths(outer),
    nodeRadius: estimateNodeRadius(outer),
    boundingRadius: estimateBoundingRadius(outer),
    held: false,
    targetX: x,
    targetY: y,
    cx: x,
    cy: y,
    angle: 0,
  }
}

/** Rebuilds a letter's rest geometry for a new size, without touching
 *  current node positions or velocities — the shape-matching spring animates
 *  the transition on its own over the next several frames, which is what
 *  makes the size slider look like the letter actually inflating/deflating
 *  rather than snapping. */
export function rescaleLetter(letter: Letter, size: number): void {
  const outline = LETTER_OUTLINES[letter.char]
  const { restOffsets, restCenter } = centerOutline(outline.outer)

  for (let i = 0; i < letter.outer.length; i++) {
    letter.outer[i].restX = restOffsets[i].x * size
    letter.outer[i].restY = restOffsets[i].y * size
  }
  letter.holeRest = outline.holes.map((hole) =>
    hole.map((p) => ({
      x: (p.x - restCenter.x) * size,
      y: (p.y - restCenter.y) * size,
    })),
  )
  letter.restEdgeLength = computeEdgeLengths(letter.outer)
  letter.nodeRadius = estimateNodeRadius(letter.outer)
  letter.boundingRadius = estimateBoundingRadius(letter.outer)
}

/** A letter's rough on-screen width at a given size — for laying out the
 *  starting row, where a narrow "L" and a wide "B" shouldn't get equal
 *  space. Not exact (the outline's true bounding box vs. its nominal
 *  width/height ratio), just close enough for spacing. */
export function letterWidth(char: string, size: number): number {
  return LETTER_OUTLINES[char].width * size
}

function centerOutline(points: Vec[]): { restOffsets: Vec[]; restCenter: Vec } {
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  cx /= points.length
  cy /= points.length
  return {
    restOffsets: points.map((p) => ({ x: p.x - cx, y: p.y - cy })),
    restCenter: { x: cx, y: cy },
  }
}

function computeEdgeLengths(outer: Node[]): number[] {
  return outer.map((n, i) => {
    const next = outer[(i + 1) % outer.length]
    return Math.hypot(next.restX - n.restX, next.restY - n.restY)
  })
}

function estimateNodeRadius(outer: Node[]): number {
  const avg =
    outer.reduce((sum, n, i) => {
      const next = outer[(i + 1) % outer.length]
      return sum + Math.hypot(next.restX - n.restX, next.restY - n.restY)
    }, 0) / outer.length
  // A bit over half the average spacing, so neighboring points' collision
  // circles overlap slightly and the boundary reads as a continuous skin
  // rather than a string of separated dots. Kept close to the actual
  // vertex spacing on purpose: bigger than this and letters stop short of
  // where their drawn edges actually meet, reading as an invisible force
  // field around each glyph instead of letting them come into real
  // contact before anything deforms.
  return avg * 0.62
}

function estimateBoundingRadius(outer: Node[]): number {
  let max = 0
  for (const n of outer) {
    max = Math.max(max, Math.hypot(n.restX, n.restY))
  }
  return max
}

const FRICTION = 3.0 // 1/s velocity decay
const EDGE_STIFFNESS = 3200
const EDGE_DAMPING = 24
const SHAPE_STIFFNESS = 950 // scaled by the inflation-derived firmness factor
const SHAPE_DAMPING = 20
const WALL_STIFFNESS = 2600
const WALL_DAMPING = 20
const NODE_STIFFNESS = 2200
const NODE_DAMPING = 18

const MAX_WALL_PENETRATION_FRACTION = 0.35
/** How much node-pair overlap survives the hard positional correction
 *  below, as a fraction of the pair's combined radius — kept just above
 *  zero rather than exactly zero for floating-point stability, not to
 *  leave letters room to sink into each other. */
const MAX_PAIR_OVERLAP_FRACTION = 0.03
/** Skip a letter pair's O(n*m) node checks entirely unless their bounding
 *  circles are already close — most pairs, most of the time, aren't. */
const BROAD_PHASE_MARGIN = 24

/** Caps how fast a held letter's center can chase the pointer, in px/s —
 *  see the comment where it's used. Generously above any real drag speed,
 *  so this is never perceptible in ordinary use. */
const HELD_CHASE_SPEED = 1600

/** The rendered stroke (see style.css) visually dilates each letter beyond
 *  its simulated boundary by up to this many px at full inflation — kept
 *  here, not just in CSS, so collision can add matching clearance and the
 *  puffed-up *look* never overlaps even though the underlying nodes don't. */
export const MAX_DILATION_PX = 9

const SUBSTEP = 1 / 480
const MAX_FRAME = 1 / 30

/**
 * Advances the simulation by `rawDt` seconds (already multiplied by the
 * playback speed). `firmness` (roughly 0.5..1.6) scales how strongly each
 * letter resists deformation, and `dilation` (0..1) is how much visual
 * stroke-puff extra clearance collision should hold open — the inflation
 * slider's physical and visual halves, respectively.
 * Mutates `letters` in place. Returns whether anything is still moving.
 */
export function stepPhysics(
  letters: Letter[],
  containerWidth: number,
  containerHeight: number,
  rawDt: number,
  firmness: number,
  dilation: number,
): boolean {
  let remaining = Math.min(rawDt, MAX_FRAME)
  while (remaining > 0) {
    const h = Math.min(remaining, SUBSTEP)
    substep(letters, containerWidth, containerHeight, h, firmness, dilation)
    remaining -= h
  }
  return hasEnergy(letters)
}

function substep(
  letters: Letter[],
  containerWidth: number,
  containerHeight: number,
  dt: number,
  firmness: number,
  dilation: number,
): void {
  const visualPad = dilation * MAX_DILATION_PX
  // Fit each letter's current center + rotation to its rest shape, then pull
  // every point toward that fitted target. While held, the target center is
  // pinned to the pointer instead of the shape's own current average — the
  // whole letter follows the drag, but the boundary itself isn't hard-
  // pinned, so it can still lag, wobble, and squish against neighbors mid-drag.
  for (const letter of letters) {
    if (letter.held) {
      // Chase the pointer at a capped speed rather than teleporting to it
      // outright — a synthetic or very fast pointer jump could otherwise
      // move a letter's center farther in one substep than the node
      // collision below can resolve, tunneling it clean through a
      // neighbor instead of pushing against it.
      const ddx = letter.targetX - letter.cx
      const ddy = letter.targetY - letter.cy
      const chaseDist = Math.hypot(ddx, ddy)
      const maxStep = HELD_CHASE_SPEED * dt
      if (chaseDist > maxStep) {
        letter.cx += (ddx / chaseDist) * maxStep
        letter.cy += (ddy / chaseDist) * maxStep
      } else {
        letter.cx = letter.targetX
        letter.cy = letter.targetY
      }
    } else {
      let cx = 0
      let cy = 0
      for (const n of letter.outer) {
        cx += n.x
        cy += n.y
      }
      letter.cx = cx / letter.outer.length
      letter.cy = cy / letter.outer.length
    }

    let sumCross = 0
    let sumDot = 0
    for (const n of letter.outer) {
      const ox = n.x - letter.cx
      const oy = n.y - letter.cy
      sumCross += n.restX * oy - n.restY * ox
      sumDot += n.restX * ox + n.restY * oy
    }
    letter.angle = Math.atan2(sumCross, sumDot)

    const cosA = Math.cos(letter.angle)
    const sinA = Math.sin(letter.angle)
    const stiffness = SHAPE_STIFFNESS * firmness

    for (const n of letter.outer) {
      const targetX = letter.cx + (n.restX * cosA - n.restY * sinA)
      const targetY = letter.cy + (n.restX * sinA + n.restY * cosA)
      const ax = stiffness * (targetX - n.x) - SHAPE_DAMPING * n.vx
      const ay = stiffness * (targetY - n.y) - SHAPE_DAMPING * n.vy
      n.vx += ax * dt
      n.vy += ay * dt
    }
  }

  // Edge springs: keep the boundary locally taut.
  for (const letter of letters) {
    const n = letter.outer.length
    for (let i = 0; i < n; i++) {
      const a = letter.outer[i]
      const b = letter.outer[(i + 1) % n]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 0.0001
      const rest = letter.restEdgeLength[i]
      const nx = dx / dist
      const ny = dy / dist
      const stretch = dist - rest
      const relVx = b.vx - a.vx
      const relVy = b.vy - a.vy
      const closing = relVx * nx + relVy * ny
      const force = EDGE_STIFFNESS * stretch + EDGE_DAMPING * closing
      const fx = nx * force
      const fy = ny * force
      a.vx += fx * dt
      a.vy += fy * dt
      b.vx -= fx * dt
      b.vy -= fy * dt
    }
  }

  // Integrate + friction.
  const frictionFactor = Math.exp(-FRICTION * dt)
  for (const letter of letters) {
    for (const n of letter.outer) {
      n.x += n.vx * dt
      n.y += n.vy * dt
      n.vx *= frictionFactor
      n.vy *= frictionFactor
    }
  }

  // Walls: every boundary point checked independently. The stroke that
  // renders "puffiness" only extends outward from this one letter, so it
  // only needs half the dilation as extra clearance here (vs. the full
  // amount between two letters' strokes, below).
  for (const letter of letters) {
    const radius = letter.nodeRadius + visualPad / 2
    const tolerance = radius * MAX_WALL_PENETRATION_FRACTION
    for (const n of letter.outer) {
      resolveWall(n, tolerance, radius - n.x, 1, 0, dt)
      resolveWall(n, tolerance, n.x - (containerWidth - radius), -1, 0, dt)
      resolveWall(n, tolerance, radius - n.y, 0, 1, dt)
      resolveWall(n, tolerance, n.y - (containerHeight - radius), 0, -1, dt)
    }
  }

  // Pairs: boundary point vs. boundary point, between different letters only,
  // with a broad-phase pass so far-apart letters cost almost nothing.
  for (let i = 0; i < letters.length; i++) {
    const a = letters[i]
    for (let j = i + 1; j < letters.length; j++) {
      const b = letters[j]
      const cdx = b.cx - a.cx
      const cdy = b.cy - a.cy
      if (
        Math.hypot(cdx, cdy) >
        a.boundingRadius + b.boundingRadius + BROAD_PHASE_MARGIN
      ) {
        continue
      }

      const sumR = a.nodeRadius + b.nodeRadius + visualPad
      const maxOverlap = sumR * MAX_PAIR_OVERLAP_FRACTION

      for (const na of a.outer) {
        for (const nb of b.outer) {
          const dx = nb.x - na.x
          const dy = nb.y - na.y
          const dist = Math.hypot(dx, dy) || 0.0001
          const overlap = sumR - dist
          if (overlap <= 0) continue

          const nx = dx / dist
          const ny = dy / dist
          const accel = NODE_STIFFNESS * overlap

          na.vx -= nx * accel * dt
          na.vy -= ny * accel * dt
          nb.vx += nx * accel * dt
          nb.vy += ny * accel * dt

          const closing = (na.vx - nb.vx) * nx + (na.vy - nb.vy) * ny
          if (closing > 0) {
            const damp = Math.min(NODE_DAMPING * dt, 1) * closing * 0.5
            na.vx -= nx * damp
            na.vy -= ny * damp
            nb.vx += nx * damp
            nb.vy += ny * damp
          }

          const excess = overlap - maxOverlap
          if (excess > 0) {
            const push = excess / 2
            na.x -= nx * push
            na.y -= ny * push
            nb.x += nx * push
            nb.y += ny * push
          }
        }
      }
    }
  }
}

function resolveWall(
  n: { x: number; y: number; vx: number; vy: number },
  tolerance: number,
  penetration: number,
  nx: number,
  ny: number,
  dt: number,
): void {
  if (penetration <= 0) return

  const accel = WALL_STIFFNESS * penetration
  n.vx += nx * accel * dt
  n.vy += ny * accel * dt

  const into = -(n.vx * nx + n.vy * ny)
  if (into > 0) {
    const damp = Math.min(WALL_DAMPING * dt, 1) * into
    n.vx += nx * damp
    n.vy += ny * damp
  }

  const excess = penetration - tolerance
  if (excess > 0) {
    n.x += nx * excess
    n.y += ny * excess
  }
}

const REST_SPEED = 1.2

function hasEnergy(letters: Letter[]): boolean {
  for (const letter of letters) {
    if (letter.held) return true
    for (const n of letter.outer) {
      if (Math.abs(n.vx) > REST_SPEED || Math.abs(n.vy) > REST_SPEED)
        return true
    }
  }
  return false
}

/** The live hole positions for rendering — carried rigidly by the letter's
 *  fitted (center, angle), recomputed fresh each paint. */
export function liveHoles(letter: Letter): Vec[][] {
  const cosA = Math.cos(letter.angle)
  const sinA = Math.sin(letter.angle)
  return letter.holeRest.map((hole) =>
    hole.map((p) => ({
      x: letter.cx + (p.x * cosA - p.y * sinA),
      y: letter.cy + (p.x * sinA + p.y * cosA),
    })),
  )
}
