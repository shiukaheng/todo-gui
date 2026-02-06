/**
 * CursorFollowNavigationEngine - Smoothly follows the cursor node.
 *
 * Features:
 * - Centers viewport on the cursor node
 * - Computes max direct neighbor distance to determine zoom level
 * - Viewport shows max neighbor distance * margin multiplier
 * - Uses exponential smoothing for smooth transitions
 */

import {
    NavigationEngine,
    NavigationEngineInput,
    NavigationState,
    createPanZoomTransform,
} from "../types";

export interface CursorFollowNavigationEngineConfig {
    /** Margin multiplier applied to max neighbor distance. Default: 2.5 */
    marginMultiplier?: number;

    /** Smoothing rate for position (higher = faster). Default: 5 */
    positionSmoothingRate?: number;

    /** Smoothing rate for scale (higher = faster). Default: 3 */
    scaleSmoothingRate?: number;

    /** Default distance when no neighbors exist. Default: 100 */
    defaultDistance?: number;
}

const DEFAULT_CONFIG: Required<CursorFollowNavigationEngineConfig> = {
    marginMultiplier: 3,
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

    // Track previous state to detect transitions
    private prevNeighborCount = 0;
    private hadCursor = false;

    private initialized = false;

    constructor(config: CursorFollowNavigationEngineConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState {
        const { graph, viewport, deltaTime, isDraggingNode } = input;
        const dt = deltaTime / 1000; // Convert to seconds

        // If dragging a node, freeze navigation (return prevState as-is)
        if (isDraggingNode) {
            return prevState;
        }

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

        // No cursor: fit entire graph
        if (!cursorId || !cursorPos) {
            this.hadCursor = false;
            return this.fitAllNodes(graph, viewport, prevState, dt);
        }

        // Compute max direct neighbor distance and count
        const { maxDistance, neighborCount } = this.computeNeighborInfo(cursorId, cursorPos, graph);

        // Detect transition from 0 -> >0 neighbors (skip interpolation for scale only)
        // But only if we already had a cursor - don't jump on first cursor selection
        const jumpScale = this.hadCursor && this.prevNeighborCount === 0 && neighborCount > 0;
        this.prevNeighborCount = neighborCount;
        this.hadCursor = true;

        // Compute target scale: viewport should show maxDistance * marginMultiplier
        const worldSize = this.config.marginMultiplier * maxDistance;
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

        // Jump scale when transitioning from 0 -> >0 neighbors (but still animate position)
        if (jumpScale) {
            this.smoothedScale = targetScale;
        }

        {
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

    private fitAllNodes(
        graph: NavigationEngineInput['graph'],
        viewport: { width: number; height: number },
        prevState: NavigationState,
        dt: number
    ): NavigationState {
        // Collect all positions
        const positions: [number, number][] = [];
        for (const task of Object.values(graph.tasks)) {
            const pos = (task as any).position;
            if (pos) positions.push(pos);
        }

        if (positions.length === 0) {
            return prevState;
        }

        // Compute bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of positions) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }

        const boundsWidth = maxX - minX || 1;
        const boundsHeight = maxY - minY || 1;
        const targetCenterX = (minX + maxX) / 2;
        const targetCenterY = (minY + maxY) / 2;

        // Compute scale to fit bounds with padding
        const padding = 50;
        const availableWidth = viewport.width - padding * 2;
        const availableHeight = viewport.height - padding * 2;
        const targetScale = Math.min(
            availableWidth / boundsWidth,
            availableHeight / boundsHeight
        );

        // Initialize or interpolate
        if (!this.initialized || this.smoothedCenterX === null || this.smoothedCenterY === null || this.smoothedScale === null) {
            this.smoothedCenterX = targetCenterX;
            this.smoothedCenterY = targetCenterY;
            this.smoothedScale = targetScale;
            this.initialized = true;
        } else {
            const posAlpha = 1 - Math.exp(-this.config.positionSmoothingRate * dt);
            const scaleAlpha = 1 - Math.exp(-this.config.scaleSmoothingRate * dt);
            this.smoothedCenterX += (targetCenterX - this.smoothedCenterX) * posAlpha;
            this.smoothedCenterY += (targetCenterY - this.smoothedCenterY) * posAlpha;
            this.smoothedScale += (targetScale - this.smoothedScale) * scaleAlpha;
        }

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
    ): { maxDistance: number; neighborCount: number } {
        const neighbors: { id: string; type: 'parent' | 'child'; distance: number }[] = [];

        // Find direct neighbors through dependencies (skip virtual nav edges)
        for (const [depId, dep] of Object.entries(graph.dependencies)) {
            // Skip virtual navigation edges added by navigationStyleGraphData
            if (depId.startsWith('__nav__')) continue;
            const { fromId, toId } = dep.data;
            let neighborId: string | null = null;
            let neighborType: 'parent' | 'child' | null = null;

            if (fromId === cursorId) {
                neighborId = toId;
                neighborType = 'child';
            } else if (toId === cursorId) {
                neighborId = fromId;
                neighborType = 'parent';
            }

            if (neighborId && neighborType) {
                const neighborTask = graph.tasks[neighborId] as any;
                if (neighborTask?.position) {
                    const [nx, ny] = neighborTask.position;
                    const dx = nx - cursorPos[0];
                    const dy = ny - cursorPos[1];
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    neighbors.push({ id: neighborId, type: neighborType, distance });
                }
            }
        }

        if (neighbors.length === 0) {
            return { maxDistance: this.config.defaultDistance, neighborCount: 0 };
        }

        const maxDistance = Math.max(...neighbors.map(n => n.distance));
        return { maxDistance, neighborCount: neighbors.length };
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
        this.hadCursor = false;
        this.initialized = false;
    }
}
