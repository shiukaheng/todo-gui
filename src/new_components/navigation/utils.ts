/**
 * Navigation Utilities
 *
 * Pure functions for coordinate transformations and bounds calculations.
 */

import { ViewTransform, ViewportInfo, NavigationState, Position, createPanZoomTransform } from "./types";

/**
 * Axis-aligned bounding box in world space.
 */
export interface WorldBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COORDINATE TRANSFORMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transform a point from world space to screen space.
 *
 * @param world - Point in world coordinates
 * @param t - View transform
 * @returns Point in screen coordinates (pixels)
 */
export function worldToScreen(world: Position, t: ViewTransform): Position {
    return {
        x: t.a * world.x + t.c * world.y + t.tx,
        y: t.b * world.x + t.d * world.y + t.ty,
    };
}

/**
 * Transform a point from screen space to world space.
 *
 * @param screen - Point in screen coordinates (pixels)
 * @param t - View transform
 * @returns Point in world coordinates
 */
export function screenToWorld(screen: Position, t: ViewTransform): Position {
    // Inverse of 2D affine transform
    const det = t.a * t.d - t.b * t.c;
    if (Math.abs(det) < 1e-10) {
        // Degenerate transform, return origin
        return { x: 0, y: 0 };
    }
    const dx = screen.x - t.tx;
    const dy = screen.y - t.ty;
    return {
        x: (t.d * dx - t.c * dy) / det,
        y: (-t.b * dx + t.a * dy) / det,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// BOUNDS CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate the bounding box of all task positions from a positioned graph.
 *
 * @param tasks - Object map of tasks with position: [x, y]
 * @returns World-space bounds, or null if no tasks
 */
export function calculateWorldBounds(tasks: Record<string, { position: [number, number] }>): WorldBounds | null {
    const taskList = Object.values(tasks);
    if (taskList.length === 0) {
        return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const task of taskList) {
        const [x, y] = task.position;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    return { minX, minY, maxX, maxY };
}

/**
 * Expand bounds by a padding amount.
 */
export function padBounds(bounds: WorldBounds, padding: number): WorldBounds {
    return {
        minX: bounds.minX - padding,
        minY: bounds.minY - padding,
        maxX: bounds.maxX + padding,
        maxY: bounds.maxY + padding,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIT-TO-CONTENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute a transform that fits the given bounds into the viewport.
 *
 * @param bounds - World-space bounds to fit
 * @param viewport - Screen viewport dimensions
 * @param padding - Padding in screen pixels
 * @returns Navigation state with transform that fits content
 */
export function fitBoundsToViewport(
    bounds: WorldBounds,
    viewport: ViewportInfo,
    padding: number = 20
): NavigationState {
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;

    // Handle degenerate cases
    if (worldWidth <= 0 || worldHeight <= 0) {
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        return {
            transform: createPanZoomTransform(1, viewport.width / 2 - centerX, viewport.height / 2 - centerY),
        };
    }

    const availableWidth = viewport.width - 2 * padding;
    const availableHeight = viewport.height - 2 * padding;

    // Scale to fit (maintain aspect ratio)
    const scaleX = availableWidth / worldWidth;
    const scaleY = availableHeight / worldHeight;
    const scale = Math.min(scaleX, scaleY);

    // Center the content
    const worldCenterX = (bounds.minX + bounds.maxX) / 2;
    const worldCenterY = (bounds.minY + bounds.maxY) / 2;

    // Transform: first scale, then translate so world center maps to screen center
    const tx = viewport.width / 2 - worldCenterX * scale;
    const ty = viewport.height / 2 - worldCenterY * scale;

    return {
        transform: createPanZoomTransform(scale, tx, ty),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORM COMPOSITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a pan delta to a transform.
 *
 * @param t - Current transform
 * @param deltaX - Pan delta X in screen pixels
 * @param deltaY - Pan delta Y in screen pixels
 */
export function applyPan(t: ViewTransform, deltaX: number, deltaY: number): ViewTransform {
    return { ...t, tx: t.tx + deltaX, ty: t.ty + deltaY };
}

/**
 * Apply a zoom around a point.
 *
 * @param t - Current transform
 * @param factor - Zoom factor (> 1 = zoom in)
 * @param centerX - Zoom center X in screen pixels
 * @param centerY - Zoom center Y in screen pixels
 */
export function applyZoom(
    t: ViewTransform,
    factor: number,
    centerX: number,
    centerY: number
): ViewTransform {
    // To zoom around a point:
    // 1. Translate so zoom center is at origin
    // 2. Scale
    // 3. Translate back
    const newA = t.a * factor;
    const newB = t.b * factor;
    const newC = t.c * factor;
    const newD = t.d * factor;
    const newTx = centerX - factor * (centerX - t.tx);
    const newTy = centerY - factor * (centerY - t.ty);

    return { a: newA, b: newB, c: newC, d: newD, tx: newTx, ty: newTy };
}

/**
 * Linearly interpolate between two transforms.
 *
 * @param from - Start transform
 * @param to - End transform
 * @param t - Interpolation factor (0 = from, 1 = to)
 */
export function lerpTransform(from: ViewTransform, to: ViewTransform, t: number): ViewTransform {
    const lerp = (a: number, b: number) => a + (b - a) * t;
    return {
        a: lerp(from.a, to.a),
        b: lerp(from.b, to.b),
        c: lerp(from.c, to.c),
        d: lerp(from.d, to.d),
        tx: lerp(from.tx, to.tx),
        ty: lerp(from.ty, to.ty),
    };
}

/**
 * Get the scale factor from a transform (assumes uniform scale).
 */
export function getScale(t: ViewTransform): number {
    // For uniform scale without skew, a = d = scale
    return Math.sqrt(t.a * t.a + t.b * t.b);
}
