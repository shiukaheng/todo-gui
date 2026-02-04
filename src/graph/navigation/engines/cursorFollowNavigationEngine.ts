/**
 * CursorFollowNavigationEngine - Smoothly follows the cursor node.
 *
 * Features:
 * - Centers viewport on the cursor node
 * - Computes average direct neighbor distance to determine zoom level
 * - Viewport shows a configurable multiple of the average neighbor distance
 * - Uses exponential smoothing for smooth transitions
 */

import {
    NavigationEngine,
    NavigationEngineInput,
    NavigationState,
    createPanZoomTransform,
} from "../types";

export interface CursorFollowNavigationEngineConfig {
    /** Multiple of average neighbor distance to show in viewport. Default: 3 */
    distanceMultiplier?: number;

    /** Smoothing rate for position (higher = faster). Default: 5 */
    positionSmoothingRate?: number;

    /** Smoothing rate for scale (higher = faster). Default: 3 */
    scaleSmoothingRate?: number;

    /** Default distance when no neighbors exist. Default: 100 */
    defaultDistance?: number;
}

const DEFAULT_CONFIG: Required<CursorFollowNavigationEngineConfig> = {
    distanceMultiplier: 3,
    positionSmoothingRate: 5,
    scaleSmoothingRate: 3,
    defaultDistance: 100,
};

export class CursorFollowNavigationEngine implements NavigationEngine {
    private config: Required<CursorFollowNavigationEngineConfig>;

    // Smoothed state (exponential moving average)
    private smoothedCenterX: number | null = null;
    private smoothedCenterY: number | null = null;
    private smoothedScale: number | null = null;

    // Track previous neighbor count to detect 0 -> >0 transition
    private prevNeighborCount = 0;

    private initialized = false;

    constructor(config: CursorFollowNavigationEngineConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState {
        const { graph, viewport, deltaTime } = input;
        const dt = deltaTime / 1000; // Convert to seconds

        // Find cursor node (the one with selectorOutline !== null)
        let cursorId: string | null = null;
        let cursorPos: [number, number] | null = null;

        for (const [taskId, task] of Object.entries(graph.tasks)) {
            const taskData = task as any;
            if (taskData.selectorOutline !== null && taskData.selectorOutline !== undefined) {
                cursorId = taskId;
                cursorPos = taskData.position;
                break;
            }
        }

        // No cursor, return previous state
        if (!cursorId || !cursorPos) {
            return prevState;
        }

        // Compute average direct neighbor distance and count
        const { avgDistance, neighborCount } = this.computeNeighborInfo(cursorId, cursorPos, graph);

        // Detect transition from 0 -> >0 neighbors (skip interpolation)
        const jumpToTarget = this.prevNeighborCount === 0 && neighborCount > 0;
        this.prevNeighborCount = neighborCount;

        // Compute target scale: viewport should show distanceMultiplier * avgDistance
        const worldSize = this.config.distanceMultiplier * avgDistance;
        const viewportMinDim = Math.min(viewport.width, viewport.height);
        const targetScale = viewportMinDim / worldSize;

        // Target center is the cursor position
        const targetCenterX = cursorPos[0];
        const targetCenterY = cursorPos[1];

        // Initialize smoothed values on first step
        if (!this.initialized || this.smoothedCenterX === null || this.smoothedCenterY === null || this.smoothedScale === null) {
            // Try to extract current center from prevState
            const prevScale = Math.sqrt(prevState.transform.a * prevState.transform.a + prevState.transform.b * prevState.transform.b);
            if (prevScale > 0.001) {
                // Compute current center in world coordinates
                const currentCenterX = (viewport.width / 2 - prevState.transform.tx) / prevScale;
                const currentCenterY = (viewport.height / 2 - prevState.transform.ty) / prevScale;
                this.smoothedCenterX = currentCenterX;
                this.smoothedCenterY = currentCenterY;
                this.smoothedScale = prevScale;
            } else {
                this.smoothedCenterX = targetCenterX;
                this.smoothedCenterY = targetCenterY;
                this.smoothedScale = targetScale;
            }
            this.initialized = true;
        }

        // Jump directly to target when transitioning from 0 -> >0 neighbors
        if (jumpToTarget) {
            this.smoothedCenterX = targetCenterX;
            this.smoothedCenterY = targetCenterY;
            this.smoothedScale = targetScale;
        } else {
            // Apply exponential smoothing
            // Formula: smoothed += (target - smoothed) * (1 - e^(-rate * dt))
            const posAlpha = 1 - Math.exp(-this.config.positionSmoothingRate * dt);
            const scaleAlpha = 1 - Math.exp(-this.config.scaleSmoothingRate * dt);

            this.smoothedCenterX += (targetCenterX - this.smoothedCenterX) * posAlpha;
            this.smoothedCenterY += (targetCenterY - this.smoothedCenterY) * posAlpha;
            this.smoothedScale += (targetScale - this.smoothedScale) * scaleAlpha;
        }

        // Compute translation to center the smoothed position
        const panX = viewport.width / 2 - this.smoothedCenterX * this.smoothedScale;
        const panY = viewport.height / 2 - this.smoothedCenterY * this.smoothedScale;

        return {
            transform: createPanZoomTransform(this.smoothedScale, panX, panY),
        };
    }

    private computeNeighborInfo(
        cursorId: string,
        cursorPos: [number, number],
        graph: NavigationEngineInput['graph']
    ): { avgDistance: number; neighborCount: number } {
        const distances: number[] = [];

        // Find direct neighbors through dependencies
        for (const dep of Object.values(graph.dependencies)) {
            const { fromId, toId } = dep.data;
            let neighborId: string | null = null;

            if (fromId === cursorId) {
                neighborId = toId; // Child
            } else if (toId === cursorId) {
                neighborId = fromId; // Parent
            }

            if (neighborId) {
                const neighborTask = graph.tasks[neighborId] as any;
                if (neighborTask?.position) {
                    const [nx, ny] = neighborTask.position;
                    const dx = nx - cursorPos[0];
                    const dy = ny - cursorPos[1];
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    distances.push(distance);
                }
            }
        }

        if (distances.length === 0) {
            return { avgDistance: this.config.defaultDistance, neighborCount: 0 };
        }

        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        return { avgDistance, neighborCount: distances.length };
    }

    destroy(): void {
        // No resources to clean up
    }

    /**
     * Reset the smoothed state (will re-initialize from prevState on next step).
     */
    reset(): void {
        this.smoothedCenterX = null;
        this.smoothedCenterY = null;
        this.smoothedScale = null;
        this.prevNeighborCount = 0;
        this.initialized = false;
    }
}
