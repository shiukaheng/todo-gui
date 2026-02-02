/**
 * Null Simulation Engine
 *
 * A minimal placeholder engine that initializes positions but doesn't
 * compute any layout. Useful for testing the pipeline.
 */

import { SimulatorInput, SimulationEngine, SimulationState, Position } from "../types";

/**
 * Engine that places new tasks at origin (0,0)
 * and preserves existing positions unchanged.
 */
export class NullEngine implements SimulationEngine {
    step(input: SimulatorInput, prevState: SimulationState): SimulationState {
        const positions: Record<string, Position> = {};

        for (const taskId of Object.keys(input.graph.tasks)) {
            // Preserve existing position or initialize at origin
            positions[taskId] = prevState.positions[taskId] ?? { x: 0, y: 0 };
        }

        return { positions };
    }
}

/**
 * Engine that places new tasks at random positions
 * within a given radius, and preserves existing positions.
 */
export class RandomInitEngine implements SimulationEngine {
    constructor(private radius: number = 100) {}

    step(input: SimulatorInput, prevState: SimulationState): SimulationState {
        const positions: Record<string, Position> = {};

        for (const taskId of Object.keys(input.graph.tasks)) {
            if (prevState.positions[taskId]) {
                positions[taskId] = prevState.positions[taskId];
            } else {
                // Random position within radius
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * this.radius;
                positions[taskId] = {
                    x: Math.cos(angle) * r,
                    y: Math.sin(angle) * r,
                };
            }
        }

        return { positions };
    }
}
