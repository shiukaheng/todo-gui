/**
 * ===================================================================
 * Position Persistence Manager - REST-backed
 * ===================================================================
 *
 * Persists node positions to the backend via dedicated REST endpoints
 * (GET/PUT /api/views/{viewId}/positions).
 *
 * Monitors simulation positions and saves them when the graph settles.
 * Positions are fetched async on view switch via fetchPositions().
 *
 * ===================================================================
 */

import { SimulationState, Position } from "./types";
import { useTodoStore } from "../../stores/todoStore";
import { viewTrace } from "../../utils/viewTrace";

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
 * Saves to server via PUT /api/views/{viewId}/positions.
 * Loads via GET /api/views/{viewId}/positions.
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
     * Fetch positions for a view from the server via REST.
     *
     * @returns Loaded positions, or null if view doesn't exist
     */
    async fetchPositions(viewId: string): Promise<Record<string, Position> | null> {
        const { baseUrl } = useTodoStore.getState();
        if (!baseUrl) {
            console.log(`[Pos] FETCH skip — no baseUrl`);
            return null;
        }

        console.log(`[Pos] FETCH start view='${viewId}'`);

        try {
            const response = await fetch(`${baseUrl}/api/views/${encodeURIComponent(viewId)}/positions`);
            if (response.status === 404) {
                console.log(`[Pos] FETCH 404 view='${viewId}' — view does not exist on server`);
                return null;
            }
            if (!response.ok) {
                console.error(`[Pos] FETCH FAIL view='${viewId}' status=${response.status}`);
                return null;
            }
            const data = await response.json();
            const rawPositions = data.positions || {};
            const positions: Record<string, Position> = {};
            for (const [nodeId, coords] of Object.entries(rawPositions)) {
                if (Array.isArray(coords) && coords.length >= 2) {
                    positions[nodeId] = { x: (coords as number[])[0], y: (coords as number[])[1] };
                }
            }
            console.log(`[Pos] FETCH done view='${viewId}' count=${Object.keys(positions).length}`);
            return positions;
        } catch (err) {
            console.error(`[Pos] FETCH error view='${viewId}'`, err);
            return null;
        }
    }

    /**
     * Manually save current positions to server via PUT.
     * Normally called automatically when graph settles.
     */
    savePositionsNow(viewIdOverride?: string): void {
        if (!this.getSimulationState) {
            console.log(`[Pos] SAVE skip — not started`);
            return;
        }

        const state = this.getSimulationState();
        const positions = state.positions;
        const count = Object.keys(positions).length;

        if (count === 0) {
            console.log(`[Pos] SAVE skip — 0 positions in simulation`);
            return;
        }

        const { baseUrl, activeView } = useTodoStore.getState();
        const targetViewId = viewIdOverride ?? activeView;
        if (!baseUrl) {
            console.log(`[Pos] SAVE skip — no baseUrl`);
            return;
        }

        const serverPositions: { [key: string]: Array<number> } = {};
        for (const [nodeId, pos] of Object.entries(positions)) {
            serverPositions[nodeId] = [pos.x, pos.y];
        }
        console.log(`[Pos] SAVE view='${targetViewId}' count=${count} (activeView='${activeView}', override=${viewIdOverride ?? 'none'})`);
        fetch(`${baseUrl}/api/views/${encodeURIComponent(targetViewId)}/positions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positions: serverPositions }),
        }).then(() => {
            console.log(`[Pos] SAVE ok view='${targetViewId}'`);
        }).catch(err => {
            console.error(`[Pos] SAVE FAIL view='${targetViewId}'`, err);
        });
    }

    /**
     * Pause or resume position saving.
     * When paused, settlement detection and saving are skipped.
     */
    setPaused(paused: boolean): void {
        viewTrace('Position', 'setPaused', { paused });
        this.paused = paused;
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

        // Detect transition: unsettled → settled (auto-save disabled, use savepos command)
        if (!this.isCurrentlySettled && settled) {
            console.log(`[Pos] SETTLED (auto-save disabled — use 'savepos' command)`);
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
