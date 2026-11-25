/**
 * Affine-matrix helpers for moving between page units and PDF user space.
 *
 * The viewer hands us one matrix per page (user space to page units). Export
 * inverts it, so rotated pages and offset crop boxes need no special cases.
 */
import type { Matrix } from './types';

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Transforms a direction, ignoring the translation part. */
export function applyLinear(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

/** Returns the inverse transform. Throws if the matrix is singular, which a valid page transform never is. */
export function invertMatrix(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) throw new Error('Page transform is not invertible');
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

/** Result of `multiply(a, b)` applies `b` first, then `a`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export interface UserSpacePlacement {
  x: number;
  y: number;
  /** Counter-clockwise rotation in radians that makes content read upright on the displayed page. */
  angle: number;
  /** Factor from page units to user-space units (1 unless the page sets a UserUnit). */
  scale: number;
}

/**
 * Converts an anchor point in page units into what a PDF drawing call needs.
 * For text pass the baseline start; for images pass the bottom-left corner.
 */
export function toUserSpace(viewTransform: Matrix, x: number, y: number): UserSpacePlacement {
  const inv = invertMatrix(viewTransform);
  const [ux, uy] = applyMatrix(inv, x, y);
  const [dx, dy] = applyLinear(inv, 1, 0);
  return { x: ux, y: uy, angle: Math.atan2(dy, dx), scale: Math.hypot(dx, dy) };
}
