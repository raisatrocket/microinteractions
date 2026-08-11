/**
 * Outline polygons for each glyph, traced from the actual Baloo 2 (weight
 * 800) font used elsewhere on the site — not hand-drawn — so the soft-body
 * simulation and the SVG rendering both work from the real letterform: a
 * bold, rounded, uniform-stroke glyph with the correct concavities (the
 * pinch at a B's waist, the notch in a U) and, for B, its two counters as
 * separate hole loops.
 *
 * Extraction: opentype.js parses the glyph into cubic/quadratic bezier
 * commands, which are rasterized (node-canvas, nonzero fill) at high
 * resolution, silhouette-traced with marching squares (which resolves the
 * font's overlapping constituent contours into one clean outer boundary
 * plus true holes automatically — no manual winding-rule bookkeeping), and
 * simplified with Ramer-Douglas-Peucker. Coordinates are normalized to
 * 0..width, 0..1 (y-down).
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
  { x: -0.0013, y: 0.1 },
  { x: 0.025, y: 0.0563 },
  { x: 0.09, y: 0.0262 },
  { x: 0.305, y: -0.0013 },
  { x: 0.4125, y: -0.0013 },
  { x: 0.535, y: 0.0138 },
  { x: 0.635, y: 0.0462 },
  { x: 0.705, y: 0.0912 },
  { x: 0.7462, y: 0.14 },
  { x: 0.7688, y: 0.19 },
  { x: 0.7788, y: 0.2375 },
  { x: 0.7762, y: 0.32 },
  { x: 0.7412, y: 0.395 },
  { x: 0.6975, y: 0.4363 },
  { x: 0.6338, y: 0.47 },
  { x: 0.725, y: 0.5162 },
  { x: 0.7812, y: 0.575 },
  { x: 0.8113, y: 0.66 },
  { x: 0.8087, y: 0.75 },
  { x: 0.7812, y: 0.835 },
  { x: 0.725, y: 0.9038 },
  { x: 0.6475, y: 0.9513 },
  { x: 0.555, y: 0.9812 },
  { x: 0.4175, y: 0.9988 },
  { x: 0.245, y: 0.9938 },
  { x: 0.1175, y: 0.9712 },
  { x: 0.0375, y: 0.9337 },
  { x: 0.0112, y: 0.9025 },
  { x: -0.0013, y: 0.8625 },
]

const B_HOLE_UPPER: Vec[] = [
  { x: 0.265, y: 0.5887 },
  { x: 0.2675, y: 0.7788 },
  { x: 0.415, y: 0.7887 },
  { x: 0.4675, y: 0.7762 },
  { x: 0.5, y: 0.7562 },
  { x: 0.5312, y: 0.705 },
  { x: 0.5288, y: 0.65 },
  { x: 0.505, y: 0.6138 },
  { x: 0.4375, y: 0.5887 },
]

const B_HOLE_LOWER: Vec[] = [
  { x: 0.265, y: 0.2112 },
  { x: 0.265, y: 0.3962 },
  { x: 0.425, y: 0.3937 },
  { x: 0.4813, y: 0.3675 },
  { x: 0.5038, y: 0.33 },
  { x: 0.5062, y: 0.2775 },
  { x: 0.4675, y: 0.2263 },
  { x: 0.4025, y: 0.2062 },
]

const U_OUTER: Vec[] = [
  { x: -0.0013, y: 0.015 },
  { x: 0.155, y: -0.0013 },
  { x: 0.215, y: 0.0112 },
  { x: 0.2562, y: 0.0425 },
  { x: 0.2737, y: 0.1 },
  { x: 0.2762, y: 0.6525 },
  { x: 0.3038, y: 0.72 },
  { x: 0.3475, y: 0.7588 },
  { x: 0.3875, y: 0.7738 },
  { x: 0.4475, y: 0.7762 },
  { x: 0.505, y: 0.7562 },
  { x: 0.5437, y: 0.72 },
  { x: 0.5687, y: 0.6675 },
  { x: 0.5737, y: 0.015 },
  { x: 0.73, y: -0.0013 },
  { x: 0.81, y: 0.0213 },
  { x: 0.8438, y: 0.0725 },
  { x: 0.8488, y: 0.205 },
  { x: 0.8488, y: 0.6575 },
  { x: 0.8263, y: 0.7625 },
  { x: 0.7837, y: 0.8425 },
  { x: 0.7325, y: 0.8988 },
  { x: 0.685, y: 0.9337 },
  { x: 0.575, y: 0.9812 },
  { x: 0.4625, y: 0.9988 },
  { x: 0.2825, y: 0.9838 },
  { x: 0.175, y: 0.9413 },
  { x: 0.1125, y: 0.8962 },
  { x: 0.0512, y: 0.8225 },
  { x: 0.0163, y: 0.7475 },
  { x: -0.0013, y: 0.6525 },
]

const L_OUTER: Vec[] = [
  { x: -0.0013, y: 0.015 },
  { x: 0.0975, y: -0.0013 },
  { x: 0.1825, y: 0.0013 },
  { x: 0.24, y: 0.0213 },
  { x: 0.2687, y: 0.055 },
  { x: 0.2812, y: 0.11 },
  { x: 0.2812, y: 0.77 },
  { x: 0.65, y: 0.7712 },
  { x: 0.6813, y: 0.8625 },
  { x: 0.6787, y: 0.92 },
  { x: 0.6613, y: 0.9625 },
  { x: 0.6325, y: 0.9888 },
  { x: 0.6, y: 0.9988 },
  { x: 0.1275, y: 0.9988 },
  { x: 0.0725, y: 0.9838 },
  { x: 0.0262, y: 0.945 },
  { x: -0.0013, y: 0.87 },
]

const E_OUTER: Vec[] = [
  { x: -0.0013, y: 0.13 },
  { x: 0.0112, y: 0.08 },
  { x: 0.0338, y: 0.045 },
  { x: 0.07, y: 0.0163 },
  { x: 0.1125, y: 0.0013 },
  { x: 0.6963, y: 0.0025 },
  { x: 0.7188, y: 0.06 },
  { x: 0.7238, y: 0.1175 },
  { x: 0.7137, y: 0.17 },
  { x: 0.6825, y: 0.2087 },
  { x: 0.64, y: 0.2238 },
  { x: 0.2787, y: 0.225 },
  { x: 0.28, y: 0.3762 },
  { x: 0.6475, y: 0.3762 },
  { x: 0.6687, y: 0.4225 },
  { x: 0.6737, y: 0.5275 },
  { x: 0.6613, y: 0.56 },
  { x: 0.635, y: 0.5863 },
  { x: 0.6025, y: 0.5988 },
  { x: 0.4025, y: 0.5988 },
  { x: 0.2787, y: 0.6 },
  { x: 0.2787, y: 0.77 },
  { x: 0.6975, y: 0.7712 },
  { x: 0.7262, y: 0.84 },
  { x: 0.7288, y: 0.9125 },
  { x: 0.7163, y: 0.955 },
  { x: 0.69, y: 0.9838 },
  { x: 0.6475, y: 0.9988 },
  { x: 0.13, y: 0.9988 },
  { x: 0.08, y: 0.9862 },
  { x: 0.0338, y: 0.9525 },
  { x: 0.0112, y: 0.9175 },
  { x: -0.0013, y: 0.8675 },
]

export const LETTER_OUTLINES: Record<string, LetterOutline> = {
  B: {
    outer: B_OUTER,
    holes: [B_HOLE_UPPER, B_HOLE_LOWER],
    width: 0.8138,
    height: 1,
  },
  U: { outer: U_OUTER, holes: [], width: 0.8504, height: 1 },
  L: { outer: L_OUTER, holes: [], width: 0.6823, height: 1 },
  E: { outer: E_OUTER, holes: [], width: 0.7307, height: 1 },
}
