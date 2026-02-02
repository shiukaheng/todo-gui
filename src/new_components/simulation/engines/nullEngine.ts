/**
 * Null Simulation Engine
 *
 * A minimal placeholder engine that initializes positions but doesn't
 * compute any layout. Useful for testing the pipeline.
 */

import { GraphTopology, SimulationEngine, SimulationState, Position } from "../types";

/**
 * Creates a null engine that places new nodes at origin (0,0)
 * and preserves existing positions unchanged.
 */
export function createNullEngine(): SimulationEngine {
    return {
        step(topology: GraphTopology, prevState: SimulationState): SimulationState {
            const positions: Record<string, Position> = {};

            for (const nodeId of topology.nodeIds) {
                // Preserve existing position or initialize at origin
                positions[nodeId] = prevState.positions[nodeId] ?? { x: 0, y: 0 };
            }

            return { positions };
        },

        reset() {
            // No internal state to reset
        },
    };
}

/**
 * Creates a null engine that places new nodes at random positions
 * within a given radius, and preserves existing positions.
 */
export function createRandomInitEngine(radius: number = 100): SimulationEngine {
    return {
        step(topology: GraphTopology, prevState: SimulationState): SimulationState {
            const positions: Record<string, Position> = {};

            for (const nodeId of topology.nodeIds) {
                if (prevState.positions[nodeId]) {
                    positions[nodeId] = prevState.positions[nodeId];
                } else {
                    // Random position within radius
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.random() * radius;
                    positions[nodeId] = {
                        x: Math.cos(angle) * r,
                        y: Math.sin(angle) * r,
                    };
                }
            }

            return { positions };
        },

        reset() {
            // No internal state to reset
        },
    };
}
