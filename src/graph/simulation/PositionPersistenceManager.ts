/**
 * ===================================================================
 * Position Persistence Manager - Server-backed
 * ===================================================================
 *
 * Persists node positions to the backend display layer (Views API).
 *
 * Monitors simulation positions and saves them when the graph settles.
 * On initialization, loads saved positions to restore previous layout.
 *
 * ===================================================================
 */

import { SimulationState, Position } from "./types";
import { useTodoStore } from "../../stores/todoStore";

/**
 * Configuration for the position persistence manager.
 */
export interface PositionPersistenceConfig {
    /** How often to check positions (ms). Default: 1000 (1 second) */
    pollInterval?: number;

    /** Maximum movement threshold to consider "settled" (world space units). Default: 0.5 */
    settlementThreshold?: number;

    /** Debounce duration for saving to storage (ms). Default: 2000 (2 seconds) */
    saveDebounce?: number;
}

const DEFAULT_CONFIG: Required<PositionPersistenceConfig> = {
    pollInterval: 1000,
    settlementThreshold: 0.5,
    saveDebounce: 2000,
};

/**
 * Manages automatic persistence of node positions.
 * Saves to server via display batch API (update_view upsert).
 */
export class PositionPersistenceManager {
    private config: Required<PositionPersistenceConfig>;
    private pollIntervalId: ReturnType<typeof setInterval> | null = null;
    private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

    private lastPositions: Record<string, Position> | null = null;
    private isCurrentlySettled = false;
    private paused = false;

    /**
     * Callback to get current simulation state.
     * Provided by the host (GraphViewerEngine) to avoid tight coupling.
     */
    private getSimulationState: (() => SimulationState) | null = null;

    constructor(config: PositionPersistenceConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Start monitoring positions for persistence.
     *
     * @param getSimulationState - Function to get current positions
     */
    start(getSimulationState: () => SimulationState): void {
        if (this.pollIntervalId !== null) {
            console.warn("[PositionPersistence] Already started, ignoring start()");
            return;
        }

        this.getSimulationState = getSimulationState;
        this.lastPositions = null;
        this.isCurrentlySettled = false;

        // Start polling
        this.pollIntervalId = window.setInterval(
            () => this.checkPositions(),
            this.config.pollInterval
        );

        console.log("[PositionPersistence] Started monitoring");
    }

    /**
     * Stop monitoring and clean up.
     */
    stop(): void {
        if (this.pollIntervalId !== null) {
            window.clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
        }

        if (this.saveTimeoutId !== null) {
            window.clearTimeout(this.saveTimeoutId);
            this.saveTimeoutId = null;
        }

        this.getSimulationState = null;
        this.lastPositions = null;
        this.isCurrentlySettled = false;

        console.log("[PositionPersistence] Stopped monitoring");
    }

    /**
     * Load persisted positions from the current view's server data.
     *
     * @returns Loaded positions, or empty object if none exist
     */
    loadPositions(): Record<string, Position> {
        const { displayData, currentViewId } = useTodoStore.getState();
        console.log("[ViewTrace][Position] loadPositions:start", {
            ts: Date.now(),
            currentViewId,
            viewCount: Object.keys(displayData?.views || {}).length,
        });
        if (displayData?.views?.[currentViewId]) {
            const view = displayData.views[currentViewId];
            const positions: Record<string, Position> = {};
            for (const [nodeId, coords] of Object.entries(view.positions)) {
                if (Array.isArray(coords) && coords.length >= 2) {
                    positions[nodeId] = { x: coords[0], y: coords[1] };
                }
            }
            if (Object.keys(positions).length > 0) {
                console.log(`[PositionPersistence] Loaded ${Object.keys(positions).length} positions from view '${currentViewId}'`);
            }
            console.log("[ViewTrace][Position] loadPositions:done", {
                ts: Date.now(),
                currentViewId,
                loadedCount: Object.keys(positions).length,
            });
            return positions;
        }

        console.log("[ViewTrace][Position] loadPositions:done", {
            ts: Date.now(),
            currentViewId,
            loadedCount: 0,
        });
        return {};
    }

    /**
     * Manually save current positions to server.
     * Normally called automatically when graph settles.
     */
    savePositionsNow(viewIdOverride?: string): void {
        if (!this.getSimulationState) {
            console.warn("[PositionPersistence] Cannot save, not started");
            return;
        }

        const state = this.getSimulationState();
        const positions = state.positions;

        if (Object.keys(positions).length === 0) {
            return;
        }

        const { api, currentViewId } = useTodoStore.getState();
        const targetViewId = viewIdOverride ?? currentViewId;
        if (api) {
            const serverPositions: { [key: string]: Array<number> } = {};
            for (const [nodeId, pos] of Object.entries(positions)) {
                serverPositions[nodeId] = [pos.x, pos.y];
            }
            console.log("[ViewTrace][Position] savePositionsNow", {
                ts: Date.now(),
                currentViewId,
                targetViewId,
                positionCount: Object.keys(serverPositions).length,
            });
            api.displayBatch({
                displayBatchRequest: {
                    operations: [{
                        op: 'update_view',
                        view_id: targetViewId,
                        positions: serverPositions,
                    } as any],
                },
            }).catch(err => {
                console.error("[PositionPersistence] Failed to save to server:", err);
            });
        }
    }

    /**
     * Pause or resume position saving.
     * When paused, settlement detection and saving are skipped.
     */
    setPaused(paused: boolean): void {
        this.paused = paused;
        console.log("[ViewTrace][Position] setPaused", {
            ts: Date.now(),
            paused,
        });
        if (paused) {
            // Cancel any pending save
            if (this.saveTimeoutId !== null) {
                window.clearTimeout(this.saveTimeoutId);
                this.saveTimeoutId = null;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Poll current positions and check for settlement.
     * Called by interval timer.
     */
    private checkPositions(): void {
        if (!this.getSimulationState || this.paused) return;

        const state = this.getSimulationState();
        const currentPositions = state.positions;

        // Skip if no positions yet
        if (Object.keys(currentPositions).length === 0) {
            return;
        }

        // First poll - store baseline
        if (this.lastPositions === null) {
            this.lastPositions = { ...currentPositions };
            return;
        }

        // Check if settled
        const settled = this.isGraphSettled(this.lastPositions, currentPositions);

        // Detect transition: unsettled → settled
        if (!this.isCurrentlySettled && settled) {
            console.log("[PositionPersistence] Graph settled, scheduling save...");
            this.scheduleSave();
        }

        // Update state
        this.isCurrentlySettled = settled;
        this.lastPositions = { ...currentPositions };
    }

    /**
     * Determine if graph has settled (all nodes below movement threshold).
     */
    private isGraphSettled(
        prev: Record<string, Position>,
        current: Record<string, Position>
    ): boolean {
        const threshold = this.config.settlementThreshold;

        for (const nodeId in current) {
            if (!(nodeId in prev)) {
                return false;
            }

            const prevPos = prev[nodeId];
            const currPos = current[nodeId];

            const dx = currPos.x - prevPos.x;
            const dy = currPos.y - prevPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > threshold) {
                return false;
            }
        }

        for (const nodeId in prev) {
            if (!(nodeId in current)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Schedule a debounced save to storage.
     */
    private scheduleSave(): void {
        if (this.saveTimeoutId !== null) {
            window.clearTimeout(this.saveTimeoutId);
        }

        this.saveTimeoutId = window.setTimeout(
            () => {
                this.savePositionsNow();
                this.saveTimeoutId = null;
            },
            this.config.saveDebounce
        );
    }
}
