/**
 * Static Navigator
 *
 * A minimal navigator that doesn't change the view automatically.
 * Just preserves the current transform. Useful as a placeholder or
 * when external code manages the transform directly.
 */

import {
    Navigator,
    NavigatorInput,
    NavigationState,
} from "../types";

/**
 * Navigator that preserves the current view.
 * Does not auto-pan or auto-zoom. The view stays exactly where it is.
 */
export class StaticNavigator implements Navigator {
    step(input: NavigatorInput, prevState: NavigationState): NavigationState {
        // Static navigator doesn't change anything - just pass through
        return prevState;
    }
}
