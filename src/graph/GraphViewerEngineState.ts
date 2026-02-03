/**
 * GraphViewerEngineState - State pushed from the engine back to React.
 *
 * PURPOSE:
 * The engine runs imperatively in an animation loop, but sometimes React needs
 * to know about things happening inside the engine (e.g., to update UI, show
 * overlays, display info panels, etc.).
 *
 * This interface defines what information flows FROM the engine TO React.
 *
 * WHAT TO PUT HERE:
 * - UI-relevant state that React components need to render
 * - User interaction state (selected node, hovered node, etc.)
 * - Viewport/camera information if needed for overlays
 * - Simulation status flags
 *
 * WHAT NOT TO PUT HERE:
 * - Internal engine state (node positions array, physics velocities, etc.)
 * - Anything that changes every frame (would cause 60 re-renders/sec)
 * - Large data structures (would be expensive to copy)
 *
 * HOW IT FLOWS:
 * ```
 * Engine (inside animation loop)
 *     │
 *     ├─► onStateChange({ isSimulating: true, selectedNodeId: "abc" })
 *     │
 *     ▼
 * React (setEngineState called, component re-renders)
 *     │
 *     ▼
 * UI updates (e.g., info panel shows selected node details)
 * ```
 *
 * THROTTLING:
 * The engine should throttle calls to onStateChange() to avoid excessive
 * React re-renders. Only emit when state meaningfully changes, or at most
 * every N frames.
 */
export interface GraphViewerEngineState {
    /** Whether the physics simulation is currently running */
    isSimulating: boolean;

    // FUTURE IDEAS - uncomment and implement as needed:
    //
    // /** ID of the currently selected node, or null */
    // selectedNodeId: string | null;
    //
    // /** ID of the node currently under the cursor, or null */
    // hoveredNodeId: string | null;
    //
    // /** Current viewport bounds for positioning React overlays */
    // viewport: { x: number; y: number; zoom: number };
    //
    // /** Number of visible nodes (for status display) */
    // visibleNodeCount: number;
}

/** Initial state before the engine starts */
export const INITIAL_ENGINE_STATE: GraphViewerEngineState = {
    isSimulating: false,
};
