/**
 * Hand-authored outline polygons for each glyph, in a normalized coordinate
 * space (roughly 0..width, 0..1, y-down). Not traced from the actual font —
 * this is a plausible bold, rounded silhouette drawn by eye — but it's a real
 * boundary with real concavities (the pinch at a B's waist, the notch in a
 * U), not a stand-in circle. That's what the soft body actually simulates
 * and what gets rendered.
 *
 * Points go clockwise. `holes` are separate closed loops (a B's two
 * counters) rendered with fill-rule="evenodd" — they are not physically
 * simulated, just carried rigidly along with the outer boundary's fitted
 * transform, since they only matter for reading correctly as a letter, not
 * for collision.
 */

export type Vec = { x: number; y: number }

export type LetterOutline = {
  outer: Vec[]
  holes: Vec[][]
  /** Rough bounding width/height, for layout — not exact, just close. */
  width: number
  height: number
}

const B_OUTER: Vec[] = [
  { x: 0.0, y: 0.0 },
  { x: 0.3, y: 0.0 },
  { x: 0.48, y: 0.02 },
  { x: 0.62, y: 0.08 },
  { x: 0.68, y: 0.18 },
  { x: 0.69, y: 0.28 },
  { x: 0.65, y: 0.38 },
  { x: 0.55, y: 0.45 },
  { x: 0.42, y: 0.49 },
  { x: 0.3, y: 0.5 },
  { x: 0.44, y: 0.51 },
  { x: 0.58, y: 0.55 },
  { x: 0.68, y: 0.62 },
  { x: 0.72, y: 0.72 },
  { x: 0.7, y: 0.83 },
  { x: 0.62, y: 0.92 },
  { x: 0.48, y: 0.98 },
  { x: 0.3, y: 1.0 },
  { x: 0.0, y: 1.0 },
]

const B_HOLE_UPPER: Vec[] = [
  { x: 0.32, y: 0.12 },
  { x: 0.44, y: 0.1 },
  { x: 0.54, y: 0.16 },
  { x: 0.56, y: 0.26 },
  { x: 0.5, y: 0.36 },
  { x: 0.38, y: 0.38 },
  { x: 0.3, y: 0.3 },
  { x: 0.3, y: 0.18 },
]

const B_HOLE_LOWER: Vec[] = [
  { x: 0.32, y: 0.6 },
  { x: 0.46, y: 0.58 },
  { x: 0.58, y: 0.64 },
  { x: 0.6, y: 0.76 },
  { x: 0.54, y: 0.88 },
  { x: 0.4, y: 0.92 },
  { x: 0.3, y: 0.84 },
  { x: 0.3, y: 0.68 },
]

const U_OUTER: Vec[] = [
  { x: 0.0, y: 0.0 },
  { x: 0.0, y: 0.55 },
  { x: 0.02, y: 0.74 },
  { x: 0.1, y: 0.88 },
  { x: 0.22, y: 0.97 },
  { x: 0.36, y: 1.0 },
  { x: 0.5, y: 0.97 },
  { x: 0.62, y: 0.88 },
  { x: 0.7, y: 0.74 },
  { x: 0.72, y: 0.55 },
  { x: 0.72, y: 0.0 },
  { x: 0.5, y: 0.0 },
  { x: 0.5, y: 0.5 },
  { x: 0.48, y: 0.66 },
  { x: 0.42, y: 0.76 },
  { x: 0.36, y: 0.8 },
  { x: 0.3, y: 0.76 },
  { x: 0.24, y: 0.66 },
  { x: 0.22, y: 0.5 },
  { x: 0.22, y: 0.0 },
]

const L_OUTER: Vec[] = [
  { x: 0.04, y: 0.0 },
  { x: 0.22, y: 0.0 },
  { x: 0.26, y: 0.02 },
  { x: 0.26, y: 0.7 },
  { x: 0.28, y: 0.74 },
  { x: 0.34, y: 0.76 },
  { x: 0.57, y: 0.76 },
  { x: 0.61, y: 0.78 },
  { x: 0.61, y: 0.96 },
  { x: 0.59, y: 0.99 },
  { x: 0.04, y: 1.0 },
  { x: 0.01, y: 0.98 },
  { x: 0.0, y: 0.94 },
  { x: 0.0, y: 0.04 },
]

const E_OUTER: Vec[] = [
  { x: 0.0, y: 0.0 },
  { x: 0.63, y: 0.0 },
  { x: 0.67, y: 0.04 },
  { x: 0.67, y: 0.16 },
  { x: 0.63, y: 0.2 },
  { x: 0.24, y: 0.2 },
  { x: 0.24, y: 0.4 },
  { x: 0.28, y: 0.42 },
  { x: 0.52, y: 0.42 },
  { x: 0.55, y: 0.45 },
  { x: 0.55, y: 0.55 },
  { x: 0.52, y: 0.58 },
  { x: 0.28, y: 0.58 },
  { x: 0.24, y: 0.6 },
  { x: 0.24, y: 0.8 },
  { x: 0.28, y: 0.82 },
  { x: 0.63, y: 0.82 },
  { x: 0.67, y: 0.85 },
  { x: 0.67, y: 0.97 },
  { x: 0.63, y: 1.0 },
  { x: 0.0, y: 1.0 },
]

export const LETTER_OUTLINES: Record<string, LetterOutline> = {
  B: {
    outer: B_OUTER,
    holes: [B_HOLE_UPPER, B_HOLE_LOWER],
    width: 0.72,
    height: 1,
  },
  U: { outer: U_OUTER, holes: [], width: 0.72, height: 1 },
  L: { outer: L_OUTER, holes: [], width: 0.61, height: 1 },
  E: { outer: E_OUTER, holes: [], width: 0.67, height: 1 },
}
