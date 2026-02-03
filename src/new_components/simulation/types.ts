/**
 * Simulation Types
 *
 * Defines the contract for graph layout simulation engines.
 * Designed to be algorithm-agnostic, allowing graceful switching between
 * different layout strategies (force-directed, constraint-based, etc.)
 */

import { NestedGraphData } from "../../new_utils/nestGraphData";

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Position of a single node in 2D space.
 */
export interface Position {
    readonly x: number;
    readonly y: number;
}

/**
 * Portable simulation state - the minimal information needed to preserve
 * visual continuity when switching between simulation engines.
 *
 * Does NOT include algorithm-specific state (velocities, temperatures, etc.)
 * Those live inside the engine's internal closure.
 *
 * May be partial - not all nodes need positions (new nodes get initialized).
 */
export interface SimulationState {
    readonly positions: Readonly<Record<string, Position>>;
}

/**
 * Empty initial state. Use when starting fresh.
 */
export const EMPTY_SIMULATION_STATE: SimulationState = {
    positions: {},
};

/**
 * Pin status for a node - either unpinned or pinned at a specific position.
 */
export type PinStatus =
    | { pinned: false }
    | { pinned: true; position: Position };

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input to the simulation engine's step function.
 *
 * Receives the full graph data so engines can access any node/edge
 * properties they need (e.g., weight nodes by priority).
 */
export interface SimulatorInput<G extends NestedGraphData = NestedGraphData> {
    /** Full graph data (nodes with .data properties, edges). */
    readonly graph: G;

    /** Time since last frame in milliseconds (for framerate-independent physics). */
    readonly deltaTime: number;
}

/**
 * A simulation engine computes node positions from graph data.
 *
 * The `step` function has a functional signature but the engine itself
 * may maintain internal state (velocities, convergence tracking, etc.)
 *
 * Contract:
 * - MUST handle nodes in graph that have no position in prevState
 *   (initialize them - random, center, inherited from neighbors, etc.)
 * - MUST include positions for ALL nodes in graph in returned state
 * - MAY ignore positions in prevState for nodes not in graph
 * - SHOULD converge to stable positions over repeated calls
 */
export interface SimulationEngine {
    /**
     * Advance simulation by one step.
     *
     * @param input - Full graph data and delta time
     * @param prevState - Previous positions (may be partial or empty)
     * @returns New positions for all nodes in graph
     */
    step(input: SimulatorInput, prevState: SimulationState): SimulationState;

    /**
     * Update pin status for nodes. Pinned nodes are fixed at their position
     * and don't move during simulation (used for dragging).
     *
     * @param pins - Map of node ID to pin status
     */
    pinNodes(pins: ReadonlyMap<string, PinStatus>): void;

    /**
     * Clean up any resources held by the engine (timers, workers, etc.)
     * Called when the engine is replaced or the parent is destroyed.
     */
    destroy?(): void;
}

