/**
 * Force-Directed Simulation Engine
 *
 * A physics-based layout engine using:
 * - Repulsion: All nodes repel each other (inverse square law)
 * - Tension: Connected nodes attract via spring forces
 */

import { SimulationEngine, SimulatorInput, SimulationState, Position, PinStatus } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ForceDirectedConfig {
    /** Strength of node-to-node repulsion. Default: 5000 */
    repulsionStrength?: number;
    /** Strength of edge spring attraction. Default: 0.05 */
    tensionStrength?: number;
    /** Velocity damping factor (0-1). Default: 0.85 */
    friction?: number;
    /** Desired rest length for edges. Default: 150 */
    desiredEdgeLength?: number;
    /** Std deviation for random spawn positions. Default: 100 */
    spawnSigma?: number;
}

const DEFAULT_CONFIG: Required<ForceDirectedConfig> = {
    repulsionStrength: 5000,
    tensionStrength: 0.05,
    friction: 0.85,
    desiredEdgeLength: 150,
    spawnSigma: 100,
};

// ═══════════════════════════════════════════════════════════════════════════
// VECTOR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

type Vec2 = [number, number];

function vecSub(a: Vec2, b: Vec2): Vec2 {
    return [a[0] - b[0], a[1] - b[1]];
}

function vecAdd(a: Vec2, b: Vec2): Vec2 {
    return [a[0] + b[0], a[1] + b[1]];
}

function vecScale(v: Vec2, s: number): Vec2 {
    return [v[0] * s, v[1] * s];
}

function vecLength(v: Vec2): number {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

/** Box-Muller transform for Gaussian random */
function gaussianRandom(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class ForceDirectedEngine implements SimulationEngine {
    private config: Required<ForceDirectedConfig>;
    private velocities: Record<string, Vec2> = {};
    private pinnedNodes: Map<string, PinStatus> = new Map();

    constructor(config: ForceDirectedConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Update pin status for nodes. Pinned nodes are fixed at their position.
     */
    pinNodes(pins: ReadonlyMap<string, PinStatus>): void {
        this.pinnedNodes = new Map(pins);
    }

    step(input: SimulatorInput, prevState: SimulationState): SimulationState {
        const { graph, deltaTime } = input;
        const taskIds = Object.keys(graph.tasks);

        if (taskIds.length === 0) {
            return { positions: {} };
        }

        // Initialize positions for new nodes, copy existing
        const positions: Record<string, Vec2> = {};
        for (const taskId of taskIds) {
            const prev = prevState.positions[taskId];
            if (prev) {
                positions[taskId] = [prev.x, prev.y];
            } else {
                // Random Gaussian initialization
                const sigma = this.config.spawnSigma;
                positions[taskId] = [
                    sigma * gaussianRandom(),
                    sigma * gaussianRandom(),
                ];
            }

            // Initialize velocity if needed
            if (!this.velocities[taskId]) {
                this.velocities[taskId] = [0, 0];
            }
        }

        // Clean up velocities for removed nodes
        for (const taskId of Object.keys(this.velocities)) {
            if (!positions[taskId]) {
                delete this.velocities[taskId];
            }
        }

        // Compute forces
        const forces: Record<string, Vec2> = {};
        for (const taskId of taskIds) {
            forces[taskId] = [0, 0];
        }

        // Repulsion: all pairs (O(n²))
        for (let i = 0; i < taskIds.length; i++) {
            const id1 = taskIds[i];
            const pos1 = positions[id1];

            for (let j = i + 1; j < taskIds.length; j++) {
                const id2 = taskIds[j];
                const pos2 = positions[id2];

                const diff = vecSub(pos1, pos2);
                const dist = vecLength(diff);

                if (dist < 1) continue; // Avoid division by zero

                // Inverse square repulsion: F = k / d²
                const forceMag = this.config.repulsionStrength / (dist * dist);
                const force = vecScale(diff, forceMag / dist); // normalize and scale

                forces[id1] = vecAdd(forces[id1], force);
                forces[id2] = vecSub(forces[id2], force);
            }
        }

        // Tension: spring forces along edges
        for (const dep of Object.values(graph.dependencies)) {
            const sourceId = dep.data.fromId;
            const targetId = dep.data.toId;

            if (!positions[sourceId] || !positions[targetId]) continue;

            const sourcePos = positions[sourceId];
            const targetPos = positions[targetId];

            const diff = vecSub(targetPos, sourcePos);
            const dist = vecLength(diff);

            if (dist < 1) continue;

            // Spring force: F = k * (d - restLength)
            const displacement = dist - this.config.desiredEdgeLength;
            const forceMag = this.config.tensionStrength * displacement;
            const force = vecScale(diff, forceMag / dist);

            forces[sourceId] = vecAdd(forces[sourceId], force);
            forces[targetId] = vecSub(forces[targetId], force);
        }

        // Apply forces: update velocities and positions
        const dt = Math.min(deltaTime, 32) / 16; // Normalize to ~60fps, cap for stability
        const friction = this.config.friction;

        for (const taskId of taskIds) {
            // Check if node is pinned
            const pinStatus = this.pinnedNodes.get(taskId);
            if (pinStatus?.pinned) {
                // Pinned: set position to pin location, zero velocity
                positions[taskId] = [pinStatus.position.x, pinStatus.position.y];
                this.velocities[taskId] = [0, 0];
                continue;
            }

            // Update velocity: v = friction * (v + F * dt)
            const vel = this.velocities[taskId];
            const force = forces[taskId];
            this.velocities[taskId] = vecScale(
                vecAdd(vel, vecScale(force, dt)),
                friction
            );

            // Update position: p = p + v * dt
            positions[taskId] = vecAdd(positions[taskId], vecScale(this.velocities[taskId], dt));
        }

        // Convert to output format
        const result: Record<string, Position> = {};
        for (const taskId of taskIds) {
            const [x, y] = positions[taskId];
            result[taskId] = { x, y };
        }

        return { positions: result };
    }

    destroy(): void {
        this.velocities = {};
    }
}
