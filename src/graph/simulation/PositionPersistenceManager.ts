/**
 * ===================================================================
 * TEMPORARY SOLUTION - Position Persistence Manager
 * ===================================================================
 *
 * This is a TEMPORARY workaround to persist node positions between
 * sessions while we work on a proper backend storage solution.
 *
 * REMOVAL PLAN:
 * When proper backend position storage is implemented, remove this
 * entire file and delete the 2-3 lines that instantiate it in
 * GraphViewerEngine.ts (search for "PositionPersistenceManager").
 *
 * DESIGN GOALS:
 * - Zero dependencies on other graph systems
 * - Self-contained with clear start/stop lifecycle
 * - Trivial to remove (no scattered integration points)
 *
 * ===================================================================
 */

import { SimulationState, Position } from "./types";

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

    /** LocalStorage key for persisted positions. Default: "graph-positions" */
    storageKey?: string;
}

const DEFAULT_CONFIG: Required<PositionPersistenceConfig> = {
    pollInterval: 1000,
    settlementThreshold: 0.5,
    saveDebounce: 2000,
    storageKey: "graph-positions",
};

/**
 * Manages automatic persistence of node positions to browser storage.
 *
 * Monitors simulation positions and saves them to localStorage when
 * the graph settles (nodes stop moving). On initialization, loads
 * saved positions to restore previous layout.
 *
 * TEMPORARY: This is a stopgap until backend position storage exists.
 */
export class PositionPersistenceManager {
    private config: Required<PositionPersistenceConfig>;
    private pollIntervalId: ReturnType<typeof setInterval> | null = null;
    private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

    private lastPositions: Record<string, Position> | null = null;
    private isCurrentlySettled = false;

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
     * Call this during initialization to restore previous layout.
     *
     * @returns Loaded positions, or empty object if none exist
     */
    loadPositions(): Record<string, Position> {
        try {
            const stored = localStorage.getItem(this.config.storageKey);
            if (!stored) {
                console.log("[PositionPersistence] No saved positions found");
                return {};
            }

            const parsed = JSON.parse(stored) as Record<string, Position>;
            const count = Object.keys(parsed).length;
            // console.log(`[PositionPersistence] Loaded ${count} node positions from storage`);
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
            console.log("[PositionPersistence] No positions to save (empty graph)");
            return;
        }

        try {
            localStorage.setItem(this.config.storageKey, JSON.stringify(positions));
            const count = Object.keys(positions).length;
            console.log(`[PositionPersistence] Saved ${count} node positions to storage`);
        } catch (err) {
            console.error("[PositionPersistence] Failed to save positions:", err);
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
        if (!this.getSimulationState) return;

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
     *
     * @param prev - Previous positions
     * @param current - Current positions
     * @returns true if all nodes have moved less than threshold
     */
    private isGraphSettled(
        prev: Record<string, Position>,
        current: Record<string, Position>
    ): boolean {
        const threshold = this.config.settlementThreshold;

        // Check all nodes that exist in both snapshots
        for (const nodeId in current) {
            if (!(nodeId in prev)) {
                // New node appeared - not settled
                return false;
            }

            const prevPos = prev[nodeId];
            const currPos = current[nodeId];

            const dx = currPos.x - prevPos.x;
            const dy = currPos.y - prevPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > threshold) {
                // This node moved too much - not settled
                return false;
            }
        }

        // Check if any nodes were removed
        for (const nodeId in prev) {
            if (!(nodeId in current)) {
                // Node disappeared - not settled
                return false;
            }
        }

        return true;
    }

    /**
     * Schedule a debounced save to storage.
     * Multiple calls within debounce window will reset the timer.
     */
    private scheduleSave(): void {
        // Clear existing timeout
        if (this.saveTimeoutId !== null) {
            window.clearTimeout(this.saveTimeoutId);
        }

        // Schedule new save
        this.saveTimeoutId = window.setTimeout(
            () => {
                this.savePositionsNow();
                this.saveTimeoutId = null;
            },
            this.config.saveDebounce
        );
    }
}
