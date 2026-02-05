/**
 * Navigation Engine Types
 *
 * Defines the contract for viewport navigation (world space → screen space).
 *
 * The SimulationEngine determines WHERE nodes are in world space.
 * The NavigationEngine determines HOW we VIEW that world space -
 * which part of the world is visible, at what zoom level, etc.
 *
 * This enables:
 * - Manual pan/zoom (Google Maps style)
 * - Auto-focus on selected nodes
 * - Animated transitions between views
 * - Fit-to-content
 */

import { NestedGraphData } from "../preprocess/nestGraphData";
import { Position } from "../simulation/types";
import { PositionedGraphData } from "../simulation/utils";

// Re-export for convenience
export type { Position };

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
// NAVIGATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input to the navigation engine's step function.
 *
 * Receives the full positioned graph data so engines can access any
 * task properties they need (e.g., focus on selected/highlighted tasks).
 *
 * Tasks exist on an infinite 2D plane. The navigation engine decides which
 * part of that plane is visible on screen.
 */
export interface NavigationEngineInput<G extends NestedGraphData = NestedGraphData> {
    /** Full graph data with positions (tasks have .position: [x, y]). */
    readonly graph: PositionedGraphData<G>;

    /** Screen viewport dimensions. */
    readonly viewport: ViewportInfo;

    /** Time since last frame in milliseconds (for animations). */
    readonly deltaTime: number;
}

/**
 * A navigation engine computes view transforms (how we look at the world).
 *
 * The `step` function has a functional signature but the engine itself
 * may maintain internal state (animation progress, momentum, etc.)
 *
 * Contract:
 * - MUST return a valid ViewTransform
 * - SHOULD smoothly interpolate when animating
 */
export interface NavigationEngine {
    /**
     * Compute the next navigation state.
     *
     * @param input - Positions, viewport size, delta time
     * @param prevState - Previous navigation state
     * @returns New navigation state
     */
    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState;

    /**
     * Clean up any resources held by the engine (timers, listeners, etc.)
     * Called when the engine is replaced or the parent is destroyed.
     */
    destroy?(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL NAVIGATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Screen point for manual navigation operations.
 */
export interface ScreenPoint {
    readonly x: number;
    readonly y: number;
}

/**
 * Extended navigation engine interface for manual pan/zoom/rotate control.
 * Used by InteractionController for handling user gestures.
 */
export interface IManualNavigationEngine extends NavigationEngine {
    /**
     * Apply incremental pan in screen pixels.
     */
    pan(dx: number, dy: number): void;

    /**
     * Zoom around a screen point.
     * @param center - Screen coordinates to zoom around
     * @param factor - Zoom multiplier (>1 = zoom in, <1 = zoom out)
     */
    zoom(center: ScreenPoint, factor: number): void;

    /**
     * Rotate around a screen point.
     * @param center - Screen coordinates to rotate around
     * @param radians - Rotation angle in radians
     */
    rotate(center: ScreenPoint, radians: number): void;

    /**
     * Set velocity for momentum scrolling.
     * Engine applies and decays velocity in step().
     * @param vx - Horizontal velocity in screen pixels per second
     * @param vy - Vertical velocity in screen pixels per second
     */
    setVelocity(vx: number, vy: number): void;

    /**
     * Stop any ongoing momentum immediately.
     */
    stopMomentum(): void;

    /**
     * Required destroy for cleanup.
     */
    destroy(): void;
}

/**
 * Type guard to check if a navigation engine supports manual control.
 */
export function isManualNavigationEngine(engine: NavigationEngine): engine is IManualNavigationEngine {
    return (
        "pan" in engine &&
        "zoom" in engine &&
        "rotate" in engine &&
        "setVelocity" in engine &&
        "stopMomentum" in engine
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FLY NAVIGATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abstract handle for fly navigation input.
 * Provides continuous force-based movement and zoom.
 */
export interface FlyNavigationHandle {
    /** Set upward force (true = key down, false = key up) */
    up(pressed: boolean): void;
    /** Set downward force (true = key down, false = key up) */
    down(pressed: boolean): void;
    /** Set leftward force (true = key down, false = key up) */
    left(pressed: boolean): void;
    /** Set rightward force (true = key down, false = key up) */
    right(pressed: boolean): void;
    /** Set zoom in force (true = key down, false = key up) */
    zoomIn(pressed: boolean): void;
    /** Set zoom out force (true = key down, false = key up) */
    zoomOut(pressed: boolean): void;
    /** Pause auto-select cursor (true = paused, false = resumed) */
    pauseAutoselect(paused: boolean): void;
}

/**
 * Extended navigation engine interface for fly mode.
 * Combines viewport control with auto-cursor selection.
 */
export interface IFlyNavigationEngine extends NavigationEngine {
    /** Abstract input handle for key bindings */
    readonly handle: FlyNavigationHandle;

    /**
     * Set callback for cursor changes (auto-selects nearest to center).
     */
    setCursorCallback(callback: (nodeId: string | null) => void): void;

    /**
     * Required destroy for cleanup.
     */
    destroy(): void;
}

/**
 * Type guard to check if a navigation engine supports fly control.
 */
export function isFlyNavigationEngine(engine: NavigationEngine): engine is IFlyNavigationEngine {
    return "handle" in engine && "setCursorCallback" in engine;
}

