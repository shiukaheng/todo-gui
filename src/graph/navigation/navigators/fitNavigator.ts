/**
 * Fit Navigation Engine
 *
 * A navigation engine that automatically fits all content in the viewport.
 * Useful for initial view or "show all" functionality.
 */

import {
    NavigationEngine,
    NavigationEngineInput,
    NavigationState,
} from "../types";
import { calculateWorldBounds, fitBoundsToViewport, lerpTransform } from "../utils";

export interface FitNavigationEngineConfig {
    /** Padding around content in pixels. Default: 40 */
    padding?: number;
    /** Animation duration in ms. 0 = instant. Default: 300 */
    animationDuration?: number;
}

/**
 * Navigation engine that keeps all content fitted in the viewport.
 * Smoothly animates when bounds change.
 */
export class FitNavigationEngine implements NavigationEngine {
    private padding: number;
    private animationDuration: number;
    private targetState: NavigationState | null = null;
    private animationProgress = 1; // 0 = start, 1 = done

    constructor(config: FitNavigationEngineConfig = {}) {
        this.padding = config.padding ?? 40;
        this.animationDuration = config.animationDuration ?? 300;
    }

    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState {
        // Calculate bounds from graph tasks
        const worldBounds = calculateWorldBounds(input.graph.tasks);
        if (!worldBounds) {
            return prevState;
        }

        // Calculate ideal fit for current bounds
        const idealState = fitBoundsToViewport(worldBounds, input.viewport, this.padding);

        // If bounds changed significantly, start new animation
        const targetChanged = !this.targetState ||
            Math.abs(idealState.transform.a - this.targetState.transform.a) > 0.001 ||
            Math.abs(idealState.transform.tx - this.targetState.transform.tx) > 1 ||
            Math.abs(idealState.transform.ty - this.targetState.transform.ty) > 1;

        if (targetChanged) {
            this.targetState = idealState;
            if (this.animationDuration > 0) {
                this.animationProgress = 0;
            }
        }

        // Animate towards target
        if (this.animationProgress < 1 && this.animationDuration > 0) {
            this.animationProgress += input.deltaTime / this.animationDuration;
            if (this.animationProgress > 1) this.animationProgress = 1;

            // Ease-out cubic
            const t = 1 - Math.pow(1 - this.animationProgress, 3);
            return {
                transform: lerpTransform(prevState.transform, this.targetState!.transform, t),
            };
        }

        return this.targetState!;
    }
}
