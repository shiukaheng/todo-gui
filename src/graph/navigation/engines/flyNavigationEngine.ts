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
    /** Pan acceleration in screen pixels/s². Default: 5000 */
    panAccel?: number;

    /** Pan damping (higher = stops faster, ~5-20 typical). Default: 10 */
    panDamping?: number;

    /** Zoom acceleration (log-scale units/s²). Default: 8 */
    zoomAccel?: number;

    /** Zoom damping (higher = stops faster). Default: 8 */
    zoomDamping?: number;
}

const DEFAULT_CONFIG: Required<FlyNavigationEngineConfig> = {
    panAccel: 3000,
    panDamping: 5,
    zoomAccel: 8,
    zoomDamping: 8,
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
    private autoselectPaused = false;

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
            pauseAutoselect: (paused: boolean) => { this.autoselectPaused = paused; },
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

        // Apply damping: v *= e^(-damping * dt) (higher damping = faster stop)
        const panDampingFactor = Math.exp(-this.config.panDamping * dt);
        this.velocityX *= panDampingFactor;
        this.velocityY *= panDampingFactor;

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

        // Apply damping: v *= e^(-damping * dt)
        const zoomDampingFactor = Math.exp(-this.config.zoomDamping * dt);
        this.zoomVelocity *= zoomDampingFactor;

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
        if (!this.cursorCallback || this.autoselectPaused) return;

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

        this.cursorCallback(nearestId);
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
        this.forceUp = false;
        this.forceDown = false;
        this.forceLeft = false;
        this.forceRight = false;
        this.forceZoomIn = false;
        this.forceZoomOut = false;
        this.autoselectPaused = false;
    }
}
