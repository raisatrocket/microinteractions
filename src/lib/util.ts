export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Map `value` from one range to another, clamped to the output range.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1)
  return lerp(outMin, outMax, t)
}

export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}
