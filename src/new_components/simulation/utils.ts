/**
 * Simulation Utilities
 *
 * Pure functions for bridging between graph data representations
 * and the simulation system.
 */

import { NestedGraphData } from "../../new_utils/nestGraphData";
import { Position, SimulationState } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// MERGE POSITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Task with position added.
 */
export type WithPosition<T> = T & { position: [number, number] };

/**
 * Graph data with positions merged into tasks.
 */
export type PositionedGraphData<G extends NestedGraphData> = {
    tasks: {
        [K in keyof G["tasks"]]: WithPosition<G["tasks"][K]>;
    };
    dependencies: G["dependencies"];
};

/**
 * Merge positions from simulation state into graph tasks.
 *
 * Pure function.
 *
 * @param graph - Graph data (tasks without positions)
 * @param state - Simulation state with positions
 * @returns New graph with position: [x, y] added to each task
 */
export function mergePositions<G extends NestedGraphData>(
    graph: G,
    state: SimulationState
): PositionedGraphData<G> {
    const positionedTasks: Record<string, WithPosition<G["tasks"][string]>> = {};

    for (const [taskId, task] of Object.entries(graph.tasks)) {
        const pos = state.positions[taskId];
        if (!pos) {
            console.warn(`[mergePositions] Missing position for task: ${taskId}`);
            positionedTasks[taskId] = { ...task, position: [0, 0] } as WithPosition<G["tasks"][string]>;
        } else {
            positionedTasks[taskId] = { ...task, position: [pos.x, pos.y] } as WithPosition<G["tasks"][string]>;
        }
    }

    return {
        tasks: positionedTasks,
        dependencies: graph.dependencies,
    } as PositionedGraphData<G>;
}
