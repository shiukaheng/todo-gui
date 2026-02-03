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

export type CursorNeighbors = {
    topological: {
        children: string[]
        parents: string[]
        peers: {
            [parentId: string]: string[]
        }
    }
}

/** Initial empty cursor neighbors */
export const EMPTY_CURSOR_NEIGHBORS: CursorNeighbors = {
    topological: {
        children: [],
        parents: [],
        peers: {},
    },
};

export interface GraphViewerEngineState {
    /** Whether the physics simulation is currently running */
    isSimulating: boolean;

    /** Current cursor neighbors for navigation */
    cursorNeighbors: CursorNeighbors;

    /** Info text for navigation state (e.g., "Select parent (1-3)"), null when idle */
    navInfoText: string | null;

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
    cursorNeighbors: EMPTY_CURSOR_NEIGHBORS,
    navInfoText: null,
};

export type SortAxis = 'x' | 'y';

type Vec2 = [number, number];

/**
 * Compute the relevant neighbors for a cursor node.
 *
 * @param cursorId - The ID of the cursor node, or null if no cursor
 * @param dependencies - Map of dependency ID to { data: { fromId, toId } }
 * @param positions - Map of node ID to [x, y] position
 * @param sortDir - Axis to sort neighbors by ('x' or 'y', default 'y')
 * @returns CursorNeighbors with children, parents, and peers sorted by position
 */
export function computeCursorNeighbors(
    cursorId: string | null,
    dependencies: { [key: string]: { data: { fromId: string; toId: string } } },
    positions: { [key: string]: Vec2 },
    sortDir: SortAxis = 'y'
): CursorNeighbors {
    const empty: CursorNeighbors = {
        topological: {
            children: [],
            parents: [],
            peers: {},
        },
    };

    if (!cursorId) {
        return empty;
    }

    const axisIndex = sortDir === 'x' ? 0 : 1;

    const sortByAxis = (ids: string[]): string[] => {
        return [...ids].sort((a, b) => {
            const posA = positions[a];
            const posB = positions[b];
            if (!posA || !posB) return 0;
            return posA[axisIndex] - posB[axisIndex];
        });
    };

    const children: string[] = [];
    const parents: string[] = [];

    // Build parent->children map for peer computation
    const parentToChildren: Map<string, string[]> = new Map();

    for (const dep of Object.values(dependencies)) {
        const { fromId, toId } = dep.data;

        // cursor -> child (cursor is parent, toId is child)
        if (fromId === cursorId) {
            children.push(toId);
        }

        // parent -> cursor (fromId is parent, cursor is child)
        if (toId === cursorId) {
            parents.push(fromId);
        }

        // Build parent->children index for peer lookup
        if (!parentToChildren.has(fromId)) {
            parentToChildren.set(fromId, []);
        }
        parentToChildren.get(fromId)!.push(toId);
    }

    // Compute peers: siblings that share a parent with cursor
    const peers: { [parentId: string]: string[] } = {};
    for (const parentId of parents) {
        const siblings = parentToChildren.get(parentId) || [];
        // Exclude the cursor itself from peers
        const peersForParent = siblings.filter(id => id !== cursorId);
        if (peersForParent.length > 0) {
            peers[parentId] = sortByAxis(peersForParent);
        }
    }

    return {
        topological: {
            children: sortByAxis(children),
            parents: sortByAxis(parents),
            peers,
        },
    };
}
