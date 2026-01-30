// Define the structure of the message received by the worker

export type Forces = { [nodeId: string]: number[] };

// Simplified simulation parameters
export interface SimulationParameters {
    repulsionStrength: number;  // Strength of node repulsion
    tensionStrength: number;    // Strength of edge attraction
    friction: number;           // Damping factor (0-1)
    stepSize: number;           // How much to move per frame
    spawnSigma: number;         // Random spawn radius
    desiredEdgeLength: number;
}

export function getDefaultSimulationParameters(): SimulationParameters {
    return { 
        repulsionStrength: 0.1,
        tensionStrength: 0.1,
        friction: 0.85,
        stepSize: 1.0,
        spawnSigma: 1,
        desiredEdgeLength: 1,
    };
}