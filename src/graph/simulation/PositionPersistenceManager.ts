/**
 * ===================================================================
 * Position Persistence Manager - Server-backed
 * ===================================================================
 *
 * Persists node positions to the backend display layer (Views API).
 * Falls back to localStorage when no view is active.
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

    /** LocalStorage key for persisted positions (fallback). Default: "graph-positions" */
    storageKey?: string;
}

const DEFAULT_CONFIG: Required<PositionPersistenceConfig> = {
    pollInterval: 1000,
    settlementThreshold: 0.5,
    saveDebounce: 2000,
    storageKey: "graph-positions",
};

/**
 * Manages automatic persistence of node positions.
 *
 * When a view is active, saves to server via display batch API.
 * Falls back to localStorage otherwise.
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
     * Load persisted positions from storage.
     * Prefers server-backed view positions when available.
     *
     * @returns Loaded positions, or empty object if none exist
     */
    loadPositions(): Record<string, Position> {
        // Try server-backed view first
        const { displayData, currentViewId } = useTodoStore.getState();
        if (currentViewId && displayData?.views?.[currentViewId]) {
            const view = displayData.views[currentViewId];
            const positions: Record<string, Position> = {};
            for (const [nodeId, coords] of Object.entries(view.positions)) {
                if (Array.isArray(coords) && coords.length >= 2) {
                    positions[nodeId] = { x: coords[0], y: coords[1] };
                }
            }
            if (Object.keys(positions).length > 0) {
                console.log(`[PositionPersistence] Loaded ${Object.keys(positions).length} positions from view '${currentViewId}'`);
                return positions;
            }
        }

        // Fallback to localStorage
        try {
            const stored = localStorage.getItem(this.config.storageKey);
            if (!stored) {
                return {};
            }

            const parsed = JSON.parse(stored) as Record<string, Position>;
            return parsed;
        } catch (err) {
            console.error("[PositionPersistence] Failed to load positions:", err);
            return {};
        }
    }

    /**
     * Manually save current positions to storage.
     * Normally called automatically when graph settles.
     */
    savePositionsNow(): void {
        if (!this.getSimulationState) {
            console.warn("[PositionPersistence] Cannot save, not started");
            return;
        }

        const state = this.getSimulationState();
        const positions = state.positions;

        if (Object.keys(positions).length === 0) {
            return;
        }

        // Try server-backed save
        const { api, currentViewId } = useTodoStore.getState();
        if (api && currentViewId) {
            const serverPositions: { [key: string]: Array<number> } = {};
            for (const [nodeId, pos] of Object.entries(positions)) {
                serverPositions[nodeId] = [pos.x, pos.y];
            }
            api.displayBatch({
                displayBatchRequest: {
                    operations: [{
                        op: 'update_positions',
                        viewId: currentViewId,
                        positions: serverPositions,
                    }],
                },
            }).catch(err => {
                console.error("[PositionPersistence] Failed to save to server:", err);
            });
            return;
        }

        // Fallback to localStorage
        try {
            localStorage.setItem(this.config.storageKey, JSON.stringify(positions));
            const count = Object.keys(positions).length;
            console.log(`[PositionPersistence] Saved ${count} node positions to localStorage`);
        } catch (err) {
            console.error("[PositionPersistence] Failed to save positions:", err);
        }
    }

    /**
     * Pause or resume position saving.
     * When paused, settlement detection and saving are skipped.
     */
    setPaused(paused: boolean): void {
        this.paused = paused;
        if (paused) {
            // Cancel any pending save
            if (this.saveTimeoutId !== null) {
                window.clearTimeout(this.saveTimeoutId);
                this.saveTimeoutId = null;
            }
        }
    }

    /**
     * Clear persisted positions from storage.
     */
    clearPersistedPositions(): void {
        try {
            localStorage.removeItem(this.config.storageKey);
            console.log("[PositionPersistence] Cleared persisted positions");
        } catch (err) {
            console.error("[PositionPersistence] Failed to clear positions:", err);
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
