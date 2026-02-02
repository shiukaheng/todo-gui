/**
 * Fit Navigator
 *
 * A navigator that automatically fits all content in the viewport.
 * Useful for initial view or "show all" functionality.
 */

import {
    Navigator,
    NavigatorInput,
    NavigationState,
} from "../types";
import { fitBoundsToViewport, lerpTransform } from "../utils";

export interface FitNavigatorConfig {
    /** Padding around content in pixels. Default: 40 */
    padding?: number;
    /** Animation duration in ms. 0 = instant. Default: 300 */
    animationDuration?: number;
}

/**
 * Creates a navigator that keeps all content fitted in the viewport.
 *
 * Will smoothly animate when bounds change.
 */
export function createFitNavigator(config: FitNavigatorConfig = {}): Navigator {
    const padding = config.padding ?? 40;
    const animationDuration = config.animationDuration ?? 300;

    let targetState: NavigationState | null = null;
    let animationProgress = 1; // 0 = start, 1 = done

    return {
        step(input: NavigatorInput, prevState: NavigationState): NavigationState {
            // Calculate ideal fit for current bounds
            const idealState = fitBoundsToViewport(input.worldBounds, input.viewport, padding);

            // If bounds changed significantly, start new animation
            const targetChanged = !targetState ||
                Math.abs(idealState.transform.a - targetState.transform.a) > 0.001 ||
                Math.abs(idealState.transform.tx - targetState.transform.tx) > 1 ||
                Math.abs(idealState.transform.ty - targetState.transform.ty) > 1;

            if (targetChanged) {
                targetState = idealState;
                if (animationDuration > 0) {
                    animationProgress = 0;
                }
            }

            // Animate towards target
            if (animationProgress < 1 && animationDuration > 0) {
                animationProgress += input.deltaTime / animationDuration;
                if (animationProgress > 1) animationProgress = 1;

                // Ease-out cubic
                const t = 1 - Math.pow(1 - animationProgress, 3);
                return {
                    transform: lerpTransform(prevState.transform, targetState!.transform, t),
                };
            }

            return targetState!;
        },

        reset(): void {
            targetState = null;
            animationProgress = 1;
        },
    };
}
