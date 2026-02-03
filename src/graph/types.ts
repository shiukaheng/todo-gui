/**
 * Graph Viewer Types
 *
 * Shared types for the graph visualization system.
 */

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
}

/**
 * Initial app state (no cursor).
 */
export const INITIAL_APP_STATE: AppState = {
    cursor: null,
};
