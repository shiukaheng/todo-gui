/**
 * ManualNavigationEngine - User-controlled pan/zoom/rotate navigation.
 *
 * Supports:
 * - Direct pan/zoom/rotate via method calls
 * - Momentum scrolling with friction decay
 * - Smooth interpolation in step()
 */

import {
    NavigationEngine,
    IManualNavigationEngine,
    NavigationEngineInput,
    NavigationState,
    ViewTransform,
    ScreenPoint,
    IDENTITY_TRANSFORM,
} from "../types";
import {
    scaleAround,
    rotateAround,
    getScale,
} from "../../render/utils";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ManualNavigationEngineConfig {
    /** Initial transform. Default: identity centered in viewport */
    initialTransform?: ViewTransform;

    /** Friction coefficient for momentum decay (per second). Default: 5 */
    friction?: number;

    /** Minimum velocity before momentum stops (pixels/sec). Default: 10 */
    minVelocity?: number;

    /** Minimum zoom scale. Default: 0.1 */
    minScale?: number;

    /** Maximum zoom scale. Default: 10 */
    maxScale?: number;
}

const DEFAULT_CONFIG: Required<ManualNavigationEngineConfig> = {
    initialTransform: IDENTITY_TRANSFORM,
    friction: 5,
    minVelocity: 10,
    minScale: 0.1,
    maxScale: 10,
};

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL NAVIGATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class ManualNavigationEngine implements IManualNavigationEngine {
    private config: Required<ManualNavigationEngineConfig>;

    // Current transform (mutable for incremental updates)
    private transform: ViewTransform;

    // Momentum state
    private velocityX = 0;
    private velocityY = 0;

    // Track if we need to initialize from prevState
    private initialized = false;
    private hasExplicitInitialTransform: boolean;
    private lastReturnedTransform: ViewTransform | null = null;

    constructor(config: ManualNavigationEngineConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.transform = { ...this.config.initialTransform };
        this.hasExplicitInitialTransform = !!config.initialTransform;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NAVIGATION ENGINE INTERFACE
    // ═══════════════════════════════════════════════════════════════════════

    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState {
        const { deltaTime } = input;
        const dt = deltaTime / 1000; // Convert to seconds

        // On first step, inherit transform from previous engine (unless explicit initial was provided)
        if (!this.initialized) {
            if (!this.hasExplicitInitialTransform) {
                this.transform = { ...prevState.transform };
            }
            this.initialized = true;
        }

        // If prevState transform differs from what we returned last frame,
        // it means another navigation engine was active - sync to it
        // (Don't sync if prevState matches what we returned, as that's our own change)
        if (this.lastReturnedTransform) {
            const prevStateMatchesOurReturn =
                Math.abs(prevState.transform.tx - this.lastReturnedTransform.tx) < 0.01 &&
                Math.abs(prevState.transform.ty - this.lastReturnedTransform.ty) < 0.01 &&
                Math.abs(prevState.transform.a - this.lastReturnedTransform.a) < 0.0001;
            
            if (!prevStateMatchesOurReturn) {
                // Another engine was active, sync to prevState
                this.transform = { ...prevState.transform };
            }
        }

        // Apply momentum
        if (this.velocityX !== 0 || this.velocityY !== 0) {
            // Apply velocity
            this.transform = {
                ...this.transform,
                tx: this.transform.tx + this.velocityX * dt,
                ty: this.transform.ty + this.velocityY * dt,
            };

            // Apply friction (exponential decay)
            const decay = Math.exp(-this.config.friction * dt);
            this.velocityX *= decay;
            this.velocityY *= decay;

            // Stop if below threshold
            const speed = Math.sqrt(
                this.velocityX * this.velocityX + this.velocityY * this.velocityY
            );
            if (speed < this.config.minVelocity) {
                this.velocityX = 0;
                this.velocityY = 0;
            }
        }

        this.lastReturnedTransform = this.transform;
        return { transform: this.transform };
    }

    destroy(): void {
        this.stopMomentum();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MANUAL NAVIGATION ENGINE INTERFACE
    // ═══════════════════════════════════════════════════════════════════════

    pan(dx: number, dy: number): void {
        this.transform = {
            ...this.transform,
            tx: this.transform.tx + dx,
            ty: this.transform.ty + dy,
        };
    }

    zoom(center: ScreenPoint, factor: number): void {
        // Get current scale and compute clamped factor
        const currentScale = getScale(this.transform);
        const targetScale = currentScale * factor;
        const clampedScale = Math.max(
            this.config.minScale,
            Math.min(this.config.maxScale, targetScale)
        );
        const actualFactor = clampedScale / currentScale;

        if (Math.abs(actualFactor - 1) < 0.0001) return;

        // Apply scale around center using raw matrix multiplication
        this.transform = scaleAround(this.transform, [center.x, center.y], actualFactor);
    }

    rotate(center: ScreenPoint, radians: number): void {
        if (Math.abs(radians) < 0.0001) return;

        // Apply rotation around center using raw matrix multiplication
        this.transform = rotateAround(this.transform, [center.x, center.y], radians);
    }

    setVelocity(vx: number, vy: number): void {
        this.velocityX = vx;
        this.velocityY = vy;
    }

    stopMomentum(): void {
        this.velocityX = 0;
        this.velocityY = 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADDITIONAL METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get the current transform (useful for reading state).
     */
    getTransform(): ViewTransform {
        return this.transform;
    }

    /**
     * Set the transform directly (useful for restoring state).
     */
    setTransform(transform: ViewTransform): void {
        this.transform = { ...transform };
    }

    /**
     * Check if momentum is currently active.
     */
    hasMomentum(): boolean {
        return this.velocityX !== 0 || this.velocityY !== 0;
    }

    /**
     * Reset to initial state (will inherit from prevState on next step if no explicit initial transform).
     */
    reset(): void {
        this.transform = { ...this.config.initialTransform };
        this.stopMomentum();
        this.initialized = false;
    }
}
