/**
 * AutoNavigationEngine - Composite engine that switches between manual and follow modes.
 *
 * Behavior:
 * - Starts in follow mode by default (auto-fits all nodes when no cursor)
 * - When cursor transitions to a non-null node, switches to follow mode
 * - When user interacts (zoom, pan, drag), switches to manual mode
 * - Delegates to the appropriate engine based on current mode
 *
 * Implements IManualNavigationEngine so InteractionController can interact with it.
 */

import {
    NavigationEngine,
    IManualNavigationEngine,
    NavigationEngineInput,
    NavigationState,
    ScreenPoint,
} from "../types";
import { ManualNavigationEngine } from "./manualNavigationEngine";
import { CursorFollowNavigationEngine } from "./cursorFollowNavigationEngine";

export type AutoNavigationMode = 'manual' | 'follow';

export interface AutoNavigationEngineConfig {
    /** Initial mode. Default: 'follow' */
    initialMode?: AutoNavigationMode;
}

export class AutoNavigationEngine implements IManualNavigationEngine {
    private manualEngine: ManualNavigationEngine;
    private followEngine: CursorFollowNavigationEngine;
    private currentMode: AutoNavigationMode;

    // Track previous cursor to detect transitions
    private prevCursorId: string | null = null;

    // Callback when mode changes (for external listeners)
    private onModeChange?: (mode: AutoNavigationMode) => void;

    constructor(config: AutoNavigationEngineConfig = {}) {
        this.manualEngine = new ManualNavigationEngine();
        this.followEngine = new CursorFollowNavigationEngine();
        this.currentMode = config.initialMode ?? 'follow';
    }

    /**
     * Set a callback to be notified when mode changes.
     */
    setOnModeChange(callback: (mode: AutoNavigationMode) => void): void {
        this.onModeChange = callback;
    }

    /**
     * Get the current navigation mode.
     */
    getMode(): AutoNavigationMode {
        return this.currentMode;
    }

    /**
     * Explicitly set the mode.
     */
    setMode(mode: AutoNavigationMode): void {
        if (this.currentMode !== mode) {
            this.currentMode = mode;
            this.onModeChange?.(mode);

            // When switching to manual, sync transform from follow engine
            // (This ensures manual picks up where follow left off)
            if (mode === 'manual') {
                // Manual engine will inherit from prevState on next step
                this.manualEngine.reset();
            }

            // When switching to follow, reset follow engine so it starts fresh
            if (mode === 'follow') {
                this.followEngine.reset();
            }
        }
    }

    /**
     * Called by InteractionController when user starts interacting.
     * Switches to manual mode.
     */
    onUserInteraction(): void {
        this.setMode('manual');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NAVIGATION ENGINE INTERFACE
    // ═══════════════════════════════════════════════════════════════════════

    step(input: NavigationEngineInput, prevState: NavigationState): NavigationState {
        // Detect cursor transitions
        const cursorId = this.findCursorId(input.graph);

        // If cursor changed to a non-null value, switch to follow mode
        if (cursorId !== null && cursorId !== this.prevCursorId) {
            this.setMode('follow');
        }

        this.prevCursorId = cursorId;

        // Delegate to the appropriate engine
        if (this.currentMode === 'follow') {
            return this.followEngine.step(input, prevState);
        } else {
            return this.manualEngine.step(input, prevState);
        }
    }

    destroy(): void {
        this.manualEngine.destroy();
        this.followEngine.destroy?.();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MANUAL NAVIGATION ENGINE INTERFACE (delegates to manual engine)
    // ═══════════════════════════════════════════════════════════════════════

    pan(dx: number, dy: number): void {
        this.onUserInteraction();
        this.manualEngine.pan(dx, dy);
    }

    zoom(center: ScreenPoint, factor: number): void {
        this.onUserInteraction();
        this.manualEngine.zoom(center, factor);
    }

    rotate(center: ScreenPoint, radians: number): void {
        this.onUserInteraction();
        this.manualEngine.rotate(center, radians);
    }

    setVelocity(vx: number, vy: number): void {
        // Don't switch mode for momentum (it's continuation of manual interaction)
        this.manualEngine.setVelocity(vx, vy);
    }

    stopMomentum(): void {
        this.manualEngine.stopMomentum();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════

    private findCursorId(graph: NavigationEngineInput['graph']): string | null {
        for (const [taskId, task] of Object.entries(graph.tasks)) {
            const taskData = task as any;
            if (taskData.selectorOutline !== null && taskData.selectorOutline !== undefined) {
                return taskId;
            }
        }
        return null;
    }
}
