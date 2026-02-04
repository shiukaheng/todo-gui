/**
 * Graph Viewer Types
 *
 * Shared types for the graph visualization system.
 */

import { type NavDirectionMapping, DEFAULT_NAV_MAPPING } from "./graphNavigation/types";

// Re-export for convenience
export type { NavDirectionMapping };
export { DEFAULT_NAV_MAPPING };
export type { NavTarget } from "./graphNavigation/types";

/** RGB color in 0-1 range */
export type Color = [number, number, number];

/**
 * Application state that drives UI behavior in the graph viewer.
 * This is the secondary reactive source (alongside graph data).
 *
 * React owns this state and passes it down. The engine uses it for:
 * - Styling (highlight cursor node)
 * - Navigation (auto-pan to cursor)
 * - Any per-frame logic that depends on UI state
 */
export interface AppState {
    /**
     * Currently cursored/selected node ID, or null if none.
     * The cursor indicates which node has keyboard focus.
     */
    cursor: string | null;

    /**
     * Configurable mapping from directions to navigation targets.
     * Allows customization for different layout orientations.
     */
    navDirectionMapping: NavDirectionMapping;

    /**
     * Background color of the graph viewer.
     * Used for "hollow" nodes to cover edges behind them.
     */
    backgroundColor: Color;
}

/**
 * Initial app state (no cursor).
 */
export const INITIAL_APP_STATE: AppState = {
    cursor: null,
    navDirectionMapping: DEFAULT_NAV_MAPPING,
    backgroundColor: [0, 0, 0],  // Black
};
