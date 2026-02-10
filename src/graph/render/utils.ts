/**
 * 2D homogeneous transformation matrix (3x3 with implicit bottom row [0, 0, 1]):
 *
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0  1  |
 *
 * Transforms world coordinates to screen: x' = a*x + c*y + tx, y' = b*x + d*y + ty
 */
export interface ViewTransform {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

export type Color = [number, number, number];
export type Vec2 = [number, number];

export type NodeShape = 'square' | 'upTriangle' | 'downTriangle' | 'circle' | 'triangleCircle';

export interface RenderNode {
    data: { id: string };
    text: string;
    color: Color;
    borderColor: Color;
    labelColor: Color;
    outlineWidth: number;
    opacity: number;
    brightnessMultiplier: number;
    selectorOutline: Color | null;  // Outer breathing ring, null = not shown
    shortcutKeyOverlay: string | null;  // Text overlay on top-left of node, null = not shown
    shape: NodeShape;  // Node shape: square or D-shape (for inferred/AND nodes)
    hollow: boolean;   // If true, fill with background color, else fill with node color
    position: Vec2;
}

export interface RenderEdge {
    data: { fromId: string; toId: string };
    text: string;
    color: Color;
    opacity: number;
    dotted: boolean;
}

export interface RenderGraphData {
    tasks: { [key: string]: RenderNode };
    dependencies: { [key: string]: RenderEdge };
}

export const FONT_SIZE = 14;
export const STROKE_WIDTH = 4;
export const PADDING = 8;

export function colorToCSS(color: Color): string {
    return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}

/** Convert sRGB component to linear. */
function srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Convert linear component to sRGB. */
function linearToSrgb(c: number): number {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Apply brightness multiplier to a color in linear space, return CSS string. */
export function colorToCSSWithBrightness(color: Color, multiplier: number): string {
    // Convert to linear, multiply, convert back, abs for negative multipliers
    const r = Math.abs(linearToSrgb(srgbToLinear(color[0]) * multiplier));
    const g = Math.abs(linearToSrgb(srgbToLinear(color[1]) * multiplier));
    const b = Math.abs(linearToSrgb(srgbToLinear(color[2]) * multiplier));
    // Clamp to [0, 1]
    return `rgb(${Math.round(Math.min(1, r) * 255)}, ${Math.round(Math.min(1, g) * 255)}, ${Math.round(Math.min(1, b) * 255)})`;
}

export function getTextColor(bg: Color): string {
    const luminance = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
    return luminance > 0.5 ? "black" : "white";
}

export function worldToScreen(pos: Vec2, t: ViewTransform): Vec2 {
    return [
        t.a * pos[0] + t.c * pos[1] + t.tx,
        t.b * pos[0] + t.d * pos[1] + t.ty,
    ];
}

export function screenToWorld(pos: Vec2, t: ViewTransform): Vec2 {
    const det = t.a * t.d - t.b * t.c;
    if (Math.abs(det) < 1e-10) return [0, 0];
    const dx = pos[0] - t.tx;
    const dy = pos[1] - t.ty;
    return [
        (t.d * dx - t.c * dy) / det,
        (-t.b * dx + t.a * dy) / det,
    ];
}

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Create a translation matrix. */
export function translateMatrix(tx: number, ty: number): ViewTransform {
    return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

/** Create a uniform scale matrix. */
export function scaleMatrix(s: number): ViewTransform {
    return { a: s, b: 0, c: 0, d: s, tx: 0, ty: 0 };
}

/** Create a rotation matrix (radians). */
export function rotateMatrix(radians: number): ViewTransform {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
}

/**
 * Multiply two transforms: result = A × B
 * Applies B first, then A.
 */
export function multiplyTransforms(a: ViewTransform, b: ViewTransform): ViewTransform {
    return {
        a: a.a * b.a + a.c * b.b,
        b: a.b * b.a + a.d * b.b,
        c: a.a * b.c + a.c * b.d,
        d: a.b * b.c + a.d * b.d,
        tx: a.a * b.tx + a.c * b.ty + a.tx,
        ty: a.b * b.tx + a.d * b.ty + a.ty,
    };
}

/**
 * Scale around a point.
 * Equivalent to: translate(cx, cy) × scale(s) × translate(-cx, -cy) × transform
 */
export function scaleAround(
    transform: ViewTransform,
    center: Vec2,
    factor: number
): ViewTransform {
    const [cx, cy] = center;
    const T1 = translateMatrix(cx, cy);
    const S = scaleMatrix(factor);
    const T2 = translateMatrix(-cx, -cy);
    return multiplyTransforms(T1, multiplyTransforms(S, multiplyTransforms(T2, transform)));
}

/**
 * Rotate around a point.
 * Equivalent to: translate(cx, cy) × rotate(θ) × translate(-cx, -cy) × transform
 */
export function rotateAround(
    transform: ViewTransform,
    center: Vec2,
    radians: number
): ViewTransform {
    const [cx, cy] = center;
    const T1 = translateMatrix(cx, cy);
    const R = rotateMatrix(radians);
    const T2 = translateMatrix(-cx, -cy);
    return multiplyTransforms(T1, multiplyTransforms(R, multiplyTransforms(T2, transform)));
}

/**
 * Get the scale factor from a transform (assuming uniform scale).
 * Returns the length of the transformed unit X vector.
 */
export function getScale(t: ViewTransform): number {
    return Math.sqrt(t.a * t.a + t.b * t.b);
}

/**
 * Extract rotation angle from a transform matrix.
 * @returns Rotation in radians
 */
export function getRotation(t: ViewTransform): number {
    return Math.atan2(t.b, t.a);
}
