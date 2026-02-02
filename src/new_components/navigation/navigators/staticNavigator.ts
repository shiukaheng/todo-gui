/**
 * Static Navigator
 *
 * A minimal navigator that doesn't change the view automatically.
 * Useful as a base for manual pan/zoom control.
 */

import {
    Navigator,
    NavigatorInput,
    NavigationState,
    NavigatorEvent,
    INITIAL_NAVIGATION_STATE,
} from "../types";
import { applyPan, applyZoom, fitBoundsToViewport } from "../utils";

/**
 * Creates a static navigator that only responds to explicit user input.
 *
 * Does not auto-pan or auto-zoom. The view stays where it is unless
 * the user pans, zooms, or requests fit-to-content.
 */
export function createStaticNavigator(): Navigator {
    let currentState: NavigationState = INITIAL_NAVIGATION_STATE;

    return {
        step(input: NavigatorInput, prevState: NavigationState): NavigationState {
            // Static navigator doesn't change anything automatically
            // Just pass through the current state
            currentState = prevState;
            return prevState;
        },

        reset(): void {
            currentState = INITIAL_NAVIGATION_STATE;
        },

        handleInput(event: NavigatorEvent): boolean {
            switch (event.type) {
                case "pan":
                    currentState = {
                        transform: applyPan(currentState.transform, event.deltaX, event.deltaY),
                    };
                    return true;

                case "zoom":
                    currentState = {
                        transform: applyZoom(
                            currentState.transform,
                            event.factor,
                            event.centerX,
                            event.centerY
                        ),
                    };
                    return true;

                case "fit":
                    // Fit requires world bounds, which we don't have here
                    // This will be handled at a higher level
                    return false;

                default:
                    return false;
            }
        },
    };
}
