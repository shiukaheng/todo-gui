/**
 * FlyNavigationEngine - Physics-based viewport navigation with auto-cursor.
 *
 * Features:
 * - WASD keys apply continuous force while held
 * - Velocity integration with drag for smooth movement
 * - Zoom in/out commands
 * - Auto-selects the node nearest to screen center as cursor
 */

import {
    NavigationEngineInput,
    NavigationState,
    FlyNavigationHandle,
    IFlyNavigationEngine,
    createPanZoomTransform,
} from "../types";

export interface FlyNavigationEngineConfig {
    /** Pan acceleration in screen pixels/s². Default: 2000 */
    panAccel?: number;

    /** Pan drag (velocity multiplier per second, e.g. 0.01 = 1% retained after 1s). Default: 0.001 */
    panDrag?: number;

    /** Zoom acceleration (log-scale units/s²). Default: 8 */
    zoomAccel?: number;

    /** Zoom drag (velocity multiplier per second). Default: 0.001 */
    zoomDrag?: number;
}

const DEFAULT_CONFIG: Required<FlyNavigationEngineConfig> = {
    panAccel: 2000,
    panDrag: 0.001,
    zoomAccel: 8,
    zoomDrag: 0.001,
};

export class FlyNavigationEngine implements IFlyNavigationEngine {
    private config: Required<FlyNavigationEngineConfig>;

    // Input state (which directions are pressed)
    private forceUp = false;
    private forceDown = false;
    private forceLeft = false;
    private forceRight = false;
    private forceZoomIn = false;
    private forceZoomOut = false;

    // Physics state (in screen space)
    private centerX = 0;  // world coords
    private centerY = 0;  // world coords
    private velocityX = 0;  // screen pixels/s
    private velocityY = 0;  // screen pixels/s

    // Zoom state
    private scale = 1;
    private zoomVelocity = 0;  // log scale velocity

    private initialized = false;
    private cursorCallback: ((nodeId: string | null) => void) | null = null;
    private lastSelectedCursor: string | null = null;

    readonly handle: FlyNavigationHandle;

    constructor(config: FlyNavigationEngineConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Create handle with bound methods
        this.handle = {
            up: (pressed: boolean) => { this.forceUp = pressed; },
            down: (pressed: boolean) => { this.forceDown = pressed; },
            left: (pressed: boolean) => { this.forceLeft = pressed; },
            right: (pressed: boolean) => { this.forceRight = pressed; },
            zoomIn: (pressed: boolean) => { this.forceZoomIn = pressed; },
            zoomOut: (pressed: boolean) => { this.forceZoomOut = pressed; },
        };
    }

    setCursorCallback(callback: (nodeId: string | null) => void): void {
        this.cursorCallback = callback;
    }

    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState {
        const { graph, viewport, deltaTime } = input;
        const dt = deltaTime / 1000;

        // Initialize from previous state on first step
        if (!this.initialized) {
            const prevScale = Math.sqrt(prevState.transform.a * prevState.transform.a + prevState.transform.b * prevState.transform.b);
            if (prevScale > 0.001) {
                this.centerX = (viewport.width / 2 - prevState.transform.tx) / prevScale;
                this.centerY = (viewport.height / 2 - prevState.transform.ty) / prevScale;
                this.scale = prevScale;
            } else {
                this.centerX = 0;
                this.centerY = 0;
                this.scale = 1;
            }
            this.velocityX = 0;
            this.velocityY = 0;
            this.zoomVelocity = 0;
            this.initialized = true;
        }

        // === Pan physics (in screen space) ===

        // Compute acceleration from input (screen space)
        let accelX = 0;
        let accelY = 0;
        if (this.forceLeft) accelX -= 1;
        if (this.forceRight) accelX += 1;
        if (this.forceUp) accelY -= 1;
        if (this.forceDown) accelY += 1;

        // Normalize diagonal movement and apply acceleration magnitude
        const accelMag = Math.sqrt(accelX * accelX + accelY * accelY);
        if (accelMag > 0) {
            accelX = (accelX / accelMag) * this.config.panAccel;
            accelY = (accelY / accelMag) * this.config.panAccel;
        }

        // Integrate velocity
        this.velocityX += accelX * dt;
        this.velocityY += accelY * dt;

        // Apply drag: v *= drag^dt (exponential decay)
        const panDragFactor = Math.pow(this.config.panDrag, dt);
        this.velocityX *= panDragFactor;
        this.velocityY *= panDragFactor;

        // Convert screen velocity to world displacement and integrate position
        this.centerX += (this.velocityX / this.scale) * dt;
        this.centerY += (this.velocityY / this.scale) * dt;

        // === Zoom physics (in log-scale space) ===

        // Compute zoom acceleration
        let zoomAccel = 0;
        if (this.forceZoomIn) zoomAccel += this.config.zoomAccel;
        if (this.forceZoomOut) zoomAccel -= this.config.zoomAccel;

        // Integrate zoom velocity
        this.zoomVelocity += zoomAccel * dt;

        // Apply drag
        const zoomDragFactor = Math.pow(this.config.zoomDrag, dt);
        this.zoomVelocity *= zoomDragFactor;

        // Integrate scale (exponential)
        this.scale *= Math.exp(this.zoomVelocity * dt);

        // Compute transform
        const panX = viewport.width / 2 - this.centerX * this.scale;
        const panY = viewport.height / 2 - this.centerY * this.scale;

        // Auto-select cursor nearest to screen center
        this.updateCursorToNearestCenter(graph);

        return {
            transform: createPanZoomTransform(this.scale, panX, panY),
        };
    }

    private updateCursorToNearestCenter(graph: NavigationEngineInput['graph']): void {
        if (!this.cursorCallback) return;

        // Find nearest node to current center
        let nearestId: string | null = null;
        let nearestDistSq = Infinity;

        for (const [taskId, task] of Object.entries(graph.tasks)) {
            const pos = (task as any).position as [number, number] | undefined;
            if (!pos) continue;

            const dx = pos[0] - this.centerX;
            const dy = pos[1] - this.centerY;
            const distSq = dx * dx + dy * dy;

            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestId = taskId;
            }
        }

        // Only update if changed (avoid unnecessary state updates)
        if (nearestId !== this.lastSelectedCursor) {
            this.lastSelectedCursor = nearestId;
            this.cursorCallback(nearestId);
        }
    }

    destroy(): void {
        this.cursorCallback = null;
    }

    /**
     * Reset the engine state (will re-initialize from prevState on next step).
     */
    reset(): void {
        this.centerX = 0;
        this.centerY = 0;
        this.velocityX = 0;
        this.velocityY = 0;
        this.scale = 1;
        this.zoomVelocity = 0;
        this.initialized = false;
        this.lastSelectedCursor = null;
        this.forceUp = false;
        this.forceDown = false;
        this.forceLeft = false;
        this.forceRight = false;
        this.forceZoomIn = false;
        this.forceZoomOut = false;
    }
}
