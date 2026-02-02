/**
 * Simulation Utilities
 *
 * Pure functions for bridging between graph data representations
 * and the simulation system.
 */

import { NestedGraphData } from "../../new_utils/nestGraphData";
import { GraphTopology, Position, SimulationState } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT TOPOLOGY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract minimal topology from any nested graph data.
 * Discards all properties except structural information.
 *
 * Pure function.
 *
 * @param graph - Graph with nodes and edges (may have extra properties)
 * @returns Topology containing only node IDs and edge pairs
 */
export function extractTopology<G extends NestedGraphData>(graph: G): GraphTopology {
    return {
        nodeIds: graph.nodes.map((n) => n.id),
        edges: graph.edges.map((e) => [e.source, e.target] as [string, string]),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MERGE POSITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Node with position added.
 */
export type WithPosition<T> = T & { x: number; y: number };

/**
 * Graph data with positions merged into nodes.
 */
export type PositionedGraphData<G extends NestedGraphData> = {
    nodes: WithPosition<G["nodes"][number]>[];
    edges: G["edges"];
};

/**
 * Merge positions from simulation state into graph nodes.
 *
 * Pure function.
 *
 * @param graph - Graph data (nodes without positions)
 * @param state - Simulation state with positions
 * @returns New graph with x,y added to each node
 *
 * @throws If a node has no position in state (simulation should always provide all)
 */
export function mergePositions<G extends NestedGraphData>(
    graph: G,
    state: SimulationState
): PositionedGraphData<G> {
    const positionedNodes = graph.nodes.map((node) => {
        const pos = state.positions[node.id];
        if (!pos) {
            // Fallback to origin if missing (shouldn't happen if engine is correct)
            console.warn(`[mergePositions] Missing position for node: ${node.id}`);
            return { ...node, x: 0, y: 0 };
        }
        return { ...node, x: pos.x, y: pos.y };
    });

    return {
        nodes: positionedNodes,
        edges: graph.edges,
    };
}
