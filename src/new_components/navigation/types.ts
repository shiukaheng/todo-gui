/**
 * Navigation Types
 *
 * Defines the contract for viewport navigation (world space → screen space).
 *
 * The simulation engine determines WHERE nodes are in world space.
 * The navigation system determines HOW we VIEW that world space -
 * which part of the world is visible, at what zoom level, etc.
 *
 * This enables:
 * - Manual pan/zoom (Google Maps style)
 * - Auto-focus on selected nodes
 * - Animated transitions between views
 * - Fit-to-content
 */

// ═══════════════════════════════════════════════════════════════════════════
// VIEW TRANSFORM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 2D affine transform matrix for world → screen transformation.
 *
 * Represented as a 3x3 homogeneous matrix in row-major order:
 * ```
 * | a  c  tx |   | scaleX  skewX   translateX |
 * | b  d  ty | = | skewY   scaleY  translateY |
 * | 0  0  1  |   | 0       0       1          |
 * ```
 *
 * For typical pan/zoom (no skew/rotation):
 * - a = d = scale
 * - c = b = 0
 * - tx, ty = pan offset in screen pixels
 *
 * Transform a world point to screen:
 *   screenX = a * worldX + c * worldY + tx
 *   screenY = b * worldX + d * worldY + ty
 */
export interface ViewTransform {
    readonly a: number;  // scale X (or cos θ for rotation)
    readonly b: number;  // skew Y  (or sin θ for rotation)
    readonly c: number;  // skew X  (or -sin θ for rotation)
    readonly d: number;  // scale Y (or cos θ for rotation)
    readonly tx: number; // translate X (screen pixels)
    readonly ty: number; // translate Y (screen pixels)
}

/**
 * Identity transform (no change - world coords = screen coords).
 */
export const IDENTITY_TRANSFORM: ViewTransform = {
    a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0,
};

/**
 * Create a simple pan/zoom transform (no rotation or skew).
 *
 * @param scale - Zoom level (1 = 100%, 2 = 200%, etc.)
 * @param panX - Horizontal offset in screen pixels
 * @param panY - Vertical offset in screen pixels
 */
export function createPanZoomTransform(
    scale: number,
    panX: number,
    panY: number
): ViewTransform {
    return { a: scale, b: 0, c: 0, d: scale, tx: panX, ty: panY };
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Current navigation state.
 *
 * Contains the view transform and any metadata needed to preserve
 * continuity when switching navigators (similar to SimulationState).
 */
export interface NavigationState {
    /** Current world → screen transform. */
    readonly transform: ViewTransform;
}

/**
 * Default navigation state (identity transform).
 */
export const INITIAL_NAVIGATION_STATE: NavigationState = {
    transform: IDENTITY_TRANSFORM,
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEWPORT INFO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Information about the viewport (screen dimensions).
 * Passed to navigator so it can compute appropriate transforms.
 */
export interface ViewportInfo {
    /** Viewport width in pixels. */
    readonly width: number;
    /** Viewport height in pixels. */
    readonly height: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORLD BOUNDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Axis-aligned bounding box in world space.
 * Useful for fit-to-content calculations.
 */
export interface WorldBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input to the navigator's step function.
 * Contains everything the navigator might need to decide the next view.
 */
export interface NavigatorInput {
    /** Current world-space bounds of all nodes. */
    readonly worldBounds: WorldBounds;

    /** Screen viewport dimensions. */
    readonly viewport: ViewportInfo;

    /** Time since last frame in milliseconds (for animations). */
    readonly deltaTime: number;

    /** Optional: ID of node to focus on (for auto-focus navigators). */
    readonly focusNodeId?: string;

    /** Optional: World position of focus node. */
    readonly focusPosition?: { x: number; y: number };
}

/**
 * A navigator computes view transforms (how we look at the world).
 *
 * The `step` function has a functional signature but the navigator itself
 * may maintain internal state (animation progress, momentum, etc.)
 *
 * Contract:
 * - MUST return a valid ViewTransform
 * - SHOULD smoothly interpolate when animating
 * - MAY ignore focusNodeId if not an auto-focus navigator
 */
export interface Navigator {
    /**
     * Compute the next navigation state.
     *
     * @param input - World bounds, viewport size, delta time, focus info
     * @param prevState - Previous navigation state
     * @returns New navigation state
     */
    step(input: NavigatorInput, prevState: NavigationState): NavigationState;

    /**
     * Reset internal state (animation progress, momentum, etc.)
     */
    reset(): void;

    /**
     * Handle user input events (pan, zoom gestures).
     * Returns true if the event was handled.
     *
     * This is called outside the animation loop when user interacts.
     */
    handleInput?(event: NavigatorEvent): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATOR EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pan event (user dragging the viewport).
 */
export interface PanEvent {
    readonly type: "pan";
    /** Delta in screen pixels. */
    readonly deltaX: number;
    readonly deltaY: number;
}

/**
 * Zoom event (user scrolling or pinching).
 */
export interface ZoomEvent {
    readonly type: "zoom";
    /** Zoom factor (> 1 = zoom in, < 1 = zoom out). */
    readonly factor: number;
    /** Zoom center in screen coordinates. */
    readonly centerX: number;
    readonly centerY: number;
}

/**
 * Fit-to-content request.
 */
export interface FitEvent {
    readonly type: "fit";
    /** Optional padding in pixels. */
    readonly padding?: number;
}

/**
 * Union of all navigator input events.
 */
export type NavigatorEvent = PanEvent | ZoomEvent | FitEvent;

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Factory function that creates a navigator.
 */
export type CreateNavigator<TConfig = void> = (config: TConfig) => Navigator;
