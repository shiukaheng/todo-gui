/**
 * Static Navigation Engine
 *
 * A minimal navigation engine that doesn't change the view automatically.
 * Just preserves the current transform. Useful as a placeholder or
 * when external code manages the transform directly.
 */

import {
    NavigationEngine,
    NavigationEngineInput,
    NavigationState,
} from "../types";

/**
 * Navigation engine that preserves the current view.
 * Does not auto-pan or auto-zoom. The view stays exactly where it is.
 */
export class StaticNavigationEngine implements NavigationEngine {
    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState {
        // Static engine doesn't change anything - just pass through
        return prevState;
    }
}
