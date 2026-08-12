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
 * (each point a small circle) plus per-point wall checks, using three
 * layered techniques that each fix a different way two letters could end
 * up sitting inside each other:
 *
 *  - A soft spring resists overlap for feel, plus a direct positional
 *    correction (run several times per substep) that pushes any detected
 *    overlap to exactly zero and cancels the velocity driving the two
 *    together — position alone isn't enough when a sustained force (a
 *    drag, most obviously) is still pushing; without also killing that
 *    velocity, the very next substep just recreates the same overlap.
 *  - A whole-body nudge, alongside that: a per-node push only moves the
 *    specific points actually touching, which barely shifts a letter's
 *    average position if that's a small part of its boundary — and its
 *    own shape-matching spring, which only cares about staying internally
 *    undistorted and knows nothing about neighbors, promptly pulls those
 *    points right back. Moving every node of both letters together, along
 *    the line between their current centroids, is real body movement
 *    shape-matching can't undo — this is what actually breaks a
 *    multi-letter jam (several letters pushed into each other at once)
 *    instead of the correction fighting itself in place forever.
 *  - A hard cap on every node's speed, the safety net for the one thing
 *    the above can't fix after the fact: tunneling, where a boundary point
 *    skips clean through a neighbor's between one substep and the next
 *    and collision never even sees the overlap.
 *
 * Dragging a letter is its own spring pulling the whole body toward the
 * pointer, not a direct position snap — a snap would silently override
 * wherever collision had just pushed the letter's nodes, letting a drag
 * permanently win over collision instead of being resisted by it the way
 * pressing one balloon into another actually feels.
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
/** The "handle" spring pulling a held letter's whole body toward the
 *  pointer — deliberately weaker than the collision/wall response above,
 *  so a letter pressed into a neighbor or a wall visibly slows and can be
 *  fully stopped rather than the drag always winning. */
const DRAG_STIFFNESS = 1800
const DRAG_DAMPING = 30

/** Skip a letter pair's O(n*m) node checks entirely unless their bounding
 *  circles are already close — most pairs, most of the time, aren't. */
const BROAD_PHASE_MARGIN = 24
/** How many times per substep the hard positional correction re-checks
 *  every wall and every letter pair. Each pass only propagates a
 *  correction one "hop" through the contact graph (fixing A-B can
 *  reintroduce overlap in B-C), so a jammed cluster of several mutually
 *  touching letters needs enough passes for the correction to reach all
 *  the way through the chain within a single substep — cheap per pass
 *  since it's pure position math, no spring/damping recompute. */
const COLLISION_ITERATIONS = 5
/** Scales the whole-body nudge (see where it's applied) each iteration —
 *  under 1 so repeating it every iteration doesn't overshoot/oscillate. */
const WHOLE_BODY_NUDGE_FRACTION = 1

/** Caps every node's speed after all forces are applied, in px/s. Tunneling
 *  (a boundary point skipping clean through a neighbor's between one
 *  substep and the next, so collision never sees the overlap to correct
 *  it) is the one failure mode the iterative positional solver can't fix
 *  after the fact — this is the safety net for it, generous enough to
 *  never be felt in ordinary dragging. */
const MAX_NODE_SPEED = 4000

/** The rendered stroke (see style.css) visually dilates each letter by up
 *  to this many px at full inflation — purely a paint-time effect now
 *  (drawn as a round stroke straddling the simulated boundary). It used to
 *  also reserve matching clearance in collision, which kept letters a
 *  visible distance apart even at rest; removed so letters can actually
 *  touch, at the cost of the puffed-up stroke occasionally grazing a
 *  neighbor's by a px or two right at first contact. */
export const MAX_DILATION_PX = 9

const SUBSTEP = 1 / 480
const MAX_FRAME = 1 / 30

// Reused across every substep call (see the comment where they're filled,
// in substep()) instead of allocating a fresh array each time.
const candidatePairsA: Letter[] = []
const candidatePairsB: Letter[] = []

/**
 * Advances the simulation by `rawDt` seconds (already multiplied by the
 * playback speed). `firmness` (roughly 0.5..1.6) scales how strongly each
 * letter resists deformation — the inflation slider's physical half (the
 * visual half — gloss/shadow/stroke-puff — is pure CSS, driven by the same
 * slider through the `--inflation` custom property, and doesn't feed back
 * into the simulation at all).
 * Mutates `letters` in place. Returns whether anything is still moving.
 */
export function stepPhysics(
  letters: Letter[],
  containerWidth: number,
  containerHeight: number,
  rawDt: number,
  firmness: number,
): boolean {
  let remaining = Math.min(rawDt, MAX_FRAME)
  while (remaining > 0) {
    const h = Math.min(remaining, SUBSTEP)
    substep(letters, containerWidth, containerHeight, h, firmness)
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
): void {
  // Fit each letter's current center + rotation to its rest shape, then
  // pull every point toward that fitted target. The center always comes
  // from the *current* node average — including while held — rather than
  // snapping straight to the pointer: if it snapped, a held letter would
  // re-assert the literal pointer position every single substep no matter
  // what collision had just pushed its boundary out of the way of, which
  // is what let a dragged letter permanently overpower collision and sit
  // inside a neighbor instead of being resisted by it. Dragging is instead
  // a separate spring (below) pulling the whole body toward the pointer —
  // a force collision can legitimately push back against.
  for (const letter of letters) {
    let cx = 0
    let cy = 0
    for (const n of letter.outer) {
      cx += n.x
      cy += n.y
    }
    letter.cx = cx / letter.outer.length
    letter.cy = cy / letter.outer.length

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

    // The "handle" — pulls the whole body (every node equally, so it
    // doesn't fight the rotation fit above) toward the pointer. Damped
    // against the body's own average velocity, not each node's own, so it
    // damps the drag itself rather than fighting the shape-matching spring.
    if (letter.held) {
      let avgVx = 0
      let avgVy = 0
      for (const n of letter.outer) {
        avgVx += n.vx
        avgVy += n.vy
      }
      avgVx /= letter.outer.length
      avgVy /= letter.outer.length

      const dragAx =
        DRAG_STIFFNESS * (letter.targetX - letter.cx) - DRAG_DAMPING * avgVx
      const dragAy =
        DRAG_STIFFNESS * (letter.targetY - letter.cy) - DRAG_DAMPING * avgVy
      for (const n of letter.outer) {
        n.vx += dragAx * dt
        n.vy += dragAy * dt
      }
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

  // Speed clamp: the one thing standing between a strong enough combined
  // force (mostly the drag spring) and a node moving farther in this
  // substep than collision below can detect as an overlap at all.
  for (const letter of letters) {
    for (const n of letter.outer) {
      const speed = Math.hypot(n.vx, n.vy)
      if (speed > MAX_NODE_SPEED) {
        const scale = MAX_NODE_SPEED / speed
        n.vx *= scale
        n.vy *= scale
      }
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

  // Walls: every boundary point checked independently, spring + damping
  // for feel.
  for (const letter of letters) {
    const r = letter.nodeRadius
    for (const n of letter.outer) {
      resolveWallVelocity(n, r - n.x, 1, 0, dt)
      resolveWallVelocity(n, n.x - (containerWidth - r), -1, 0, dt)
      resolveWallVelocity(n, r - n.y, 0, 1, dt)
      resolveWallVelocity(n, n.y - (containerHeight - r), 0, -1, dt)
    }
  }

  // Pairs: boundary point vs. boundary point, between different letters
  // only, spring + damping for feel — with a broad-phase pass so far-apart
  // letters cost almost nothing. The candidate list is reused by the hard
  // positional pass below rather than recomputed, since it's still valid
  // within the small movement a few correction iterations produce. Two
  // parallel module-level arrays, cleared and refilled rather than
  // reallocated, since this runs up to a few hundred times a second and a
  // fresh array of [a, b] tuples every substep was real, visible GC
  // pressure — the drag actually stuttering right around pointerdown and
  // pointerup, not mid-drag, was the tell.
  candidatePairsA.length = 0
  candidatePairsB.length = 0
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
      candidatePairsA.push(a)
      candidatePairsB.push(b)

      const sumR = a.nodeRadius + b.nodeRadius
      const sumR2 = sumR * sumR
      for (const na of a.outer) {
        for (const nb of b.outer) {
          const dx = nb.x - na.x
          const dy = nb.y - na.y
          if (dx * dx + dy * dy > sumR2) continue
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
        }
      }
    }
  }

  // Hard positional correction: push any detected overlap to exactly
  // zero, and — this part matters as much as the position fix — cancel
  // the velocity driving the two apart's opposite, i.e. driving them
  // together, along that same normal. Position-only correction fixes the
  // symptom for an instant, but a sustained force (the drag spring above,
  // most obviously) just recreates the same overlap the very next
  // substep if the velocity causing it is left untouched; this is what
  // actually stops a dragged letter from parking itself inside a
  // neighbor forever. Repeated several times so a chain of mutually
  // touching letters (or a letter pinned between two others) fully
  // settles within this one substep.
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    for (const letter of letters) {
      const r = letter.nodeRadius
      for (const n of letter.outer) {
        resolveWallPosition(n, r - n.x, 1, 0)
        resolveWallPosition(n, n.x - (containerWidth - r), -1, 0)
        resolveWallPosition(n, r - n.y, 0, 1)
        resolveWallPosition(n, n.y - (containerHeight - r), 0, -1)
      }
    }
    for (let p = 0; p < candidatePairsA.length; p++) {
      const a = candidatePairsA[p]
      const b = candidatePairsB[p]
      const sumR = a.nodeRadius + b.nodeRadius
      const sumR2 = sumR * sumR

      let maxOverlap = 0
      for (const na of a.outer) {
        for (const nb of b.outer) {
          const dx = nb.x - na.x
          const dy = nb.y - na.y
          // Cheap reject before the sqrt below — the overwhelming majority
          // of node pairs, most iterations, aren't remotely close.
          if (dx * dx + dy * dy > sumR2) continue
          const dist = Math.hypot(dx, dy) || 0.0001
          const overlap = sumR - dist
          if (overlap <= 0) continue
          const push = overlap / 2
          const nx = dx / dist
          const ny = dy / dist
          na.x -= nx * push
          na.y -= ny * push
          nb.x += nx * push
          nb.y += ny * push

          const closing = (na.vx - nb.vx) * nx + (na.vy - nb.vy) * ny
          if (closing > 0) {
            const half = closing / 2
            na.vx -= nx * half
            na.vy -= ny * half
            nb.vx += nx * half
            nb.vy += ny * half
          }

          if (overlap > maxOverlap) maxOverlap = overlap
        }
      }
      if (maxOverlap === 0) continue

      // Whole-body nudge: a per-node push above only moves the specific
      // boundary points actually touching, which — if that's a small part
      // of the letter's boundary — barely shifts its average position.
      // Its own shape-matching spring, which only cares about staying
      // internally undistorted and knows nothing about neighbors, then
      // pulls those same points right back the next substep, and the
      // letter never makes net progress out of the way. This instead
      // moves *every* node of both letters, along the line between their
      // current centroids (not an average of individual push vectors,
      // which can partly cancel when two letters are interlocked from
      // several directions at once) — real body movement shape-matching
      // can't undo, which is what actually breaks a multi-letter jam
      // instead of just fighting it in place forever.
      let acx = 0
      let acy = 0
      for (const n of a.outer) {
        acx += n.x
        acy += n.y
      }
      acx /= a.outer.length
      acy /= a.outer.length
      let bcx = 0
      let bcy = 0
      for (const n of b.outer) {
        bcx += n.x
        bcy += n.y
      }
      bcx /= b.outer.length
      bcy /= b.outer.length

      const cdx = bcx - acx
      const cdy = bcy - acy
      const cdist = Math.hypot(cdx, cdy) || 0.0001
      const cnx = cdx / cdist
      const cny = cdy / cdist
      const nudgeMag = (maxOverlap / 2) * WHOLE_BODY_NUDGE_FRACTION
      const nudgeX = cnx * nudgeMag
      const nudgeY = cny * nudgeMag
      for (const n of a.outer) {
        n.x -= nudgeX
        n.y -= nudgeY
      }
      for (const n of b.outer) {
        n.x += nudgeX
        n.y += nudgeY
      }
    }
  }
}

function resolveWallVelocity(
  n: { x: number; y: number; vx: number; vy: number },
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
}

function resolveWallPosition(
  n: { x: number; y: number; vx: number; vy: number },
  penetration: number,
  nx: number,
  ny: number,
): void {
  if (penetration <= 0) return
  n.x += nx * penetration
  n.y += ny * penetration

  const into = -(n.vx * nx + n.vy * ny)
  if (into > 0) {
    n.vx += nx * into
    n.vy += ny * into
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
