/**
 * ===================================================================
 * Position Persistence Manager
 * ===================================================================
 *
 * Persists node positions locally (zustand/localStorage) and to the
 * backend via REST endpoints (GET/PUT /api/views/{viewId}/positions)
 * for named views.
 *
 * Local: saveLocalPositions() / scheduleLocalSave()
 * Server: savePositionsNow(viewId) / fetchPositions(viewId)
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
    /** Debounce duration for saving to storage (ms). Default: 2000 (2 seconds) */
    saveDebounce?: number;
}

const DEFAULT_CONFIG: Required<PositionPersistenceConfig> = {
    saveDebounce: 2000,
};

/**
 * Manages persistence of node positions.
 * Local: merges simulation positions into zustand store (localStorage).
 * Server: PUT/GET /api/views/{viewId}/positions for named views.
 */
export class PositionPersistenceManager {
    private config: Required<PositionPersistenceConfig>;
    private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
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
     * Store the simulation state getter callback.
     * Called once during setup instead of start().
     */
    setStateGetter(getSimulationState: () => SimulationState): void {
        this.getSimulationState = getSimulationState;
    }

    /**
     * Stop and clean up.
     */
    stop(): void {
        if (this.saveTimeoutId !== null) {
            window.clearTimeout(this.saveTimeoutId);
            this.saveTimeoutId = null;
        }

        this.getSimulationState = null;

        console.log("[PositionPersistence] Stopped");
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
     * Save current positions to server via PUT.
     */
    savePositionsNow(viewId: string): void {
        if (!this.getSimulationState) {
            console.log(`[Pos] SAVE skip — no state getter`);
            return;
        }

        const state = this.getSimulationState();
        const positions = state.positions;
        const count = Object.keys(positions).length;

        if (count === 0) {
            console.log(`[Pos] SAVE skip — 0 positions in simulation`);
            return;
        }

        const { baseUrl } = useTodoStore.getState();
        if (!baseUrl) {
            console.log(`[Pos] SAVE skip — no baseUrl`);
            return;
        }

        const serverPositions: { [key: string]: Array<number> } = {};
        for (const [nodeId, pos] of Object.entries(positions)) {
            serverPositions[nodeId] = [pos.x, pos.y];
        }
        console.log(`[Pos] SAVE view='${viewId}' count=${count}`);
        fetch(`${baseUrl}/api/views/${encodeURIComponent(viewId)}/positions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positions: serverPositions }),
        }).then(() => {
            console.log(`[Pos] SAVE ok view='${viewId}'`);
        }).catch(err => {
            console.error(`[Pos] SAVE FAIL view='${viewId}'`, err);
        });
    }

    /**
     * Save current simulation positions to the local zustand store.
     * Merges with existing localPositions to preserve positions of
     * nodes not in the current simulation (e.g. hidden by filter).
     */
    saveLocalPositions(): void {
        if (!this.getSimulationState) {
            console.log(`[Pos] LOCAL SAVE skip — no state getter`);
            return;
        }

        const state = this.getSimulationState();
        const positions = state.positions;
        const count = Object.keys(positions).length;

        if (count === 0) {
            console.log(`[Pos] LOCAL SAVE skip — 0 positions in simulation`);
            return;
        }

        console.log(`[Pos] LOCAL SAVE count=${count}`);
        useTodoStore.getState().setLocalPositions(positions);
    }

    /**
     * Schedule a debounced local save.
     * Respects the paused flag — does nothing while paused.
     */
    scheduleLocalSave(): void {
        if (this.paused) return;

        if (this.saveTimeoutId !== null) {
            window.clearTimeout(this.saveTimeoutId);
        }

        this.saveTimeoutId = window.setTimeout(
            () => {
                this.saveLocalPositions();
                this.saveTimeoutId = null;
            },
            this.config.saveDebounce
        );
    }

    /**
     * Pause or resume position saving.
     * When paused, scheduleLocalSave is skipped.
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
}
