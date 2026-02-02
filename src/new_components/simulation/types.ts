/**
 * Simulation Types
 *
 * Defines the contract for graph layout simulation engines.
 * Designed to be algorithm-agnostic, allowing graceful switching between
 * different layout strategies (force-directed, constraint-based, etc.)
 */

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH TOPOLOGY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal graph structure that affects layout computation.
 * Distilled from the full graph data - only what the simulation needs.
 */
export interface GraphTopology {
    /** Node identifiers. Order is not significant. */
    nodeIds: readonly string[];

    /** Directed edges as [source, target] pairs. */
    edges: readonly [source: string, target: string][];
}

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

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A simulation engine computes node positions from graph topology.
 *
 * The `step` function has a functional signature but the engine itself
 * may maintain internal state (velocities, convergence tracking, etc.)
 *
 * Contract:
 * - MUST handle nodes in topology that have no position in prevState
 *   (initialize them - random, center, inherited from neighbors, etc.)
 * - MUST include positions for ALL nodes in topology in returned state
 * - MAY ignore positions in prevState for nodes not in topology
 * - SHOULD converge to stable positions over repeated calls
 */
export interface SimulationEngine {
    /**
     * Advance simulation by one step.
     *
     * @param topology - Current graph structure (may change between calls)
     * @param prevState - Previous positions (may be partial or empty)
     * @returns New positions for all nodes in topology
     */
    step(topology: GraphTopology, prevState: SimulationState): SimulationState;

    /**
     * Reset internal state (velocities, iteration count, etc.)
     * Positions are passed in via `step`, so this doesn't affect them.
     */
    reset(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Factory function that creates a simulation engine.
 * Use this pattern to allow configuration at creation time.
 *
 * @example
 * const createForceEngine: CreateSimulationEngine = (config) => {
 *     let velocities: Record<string, Vec2> = {};
 *     return {
 *         step(topology, prevState) { ... },
 *         reset() { velocities = {}; }
 *     };
 * };
 */
export type CreateSimulationEngine<TConfig = void> = (config: TConfig) => SimulationEngine;
