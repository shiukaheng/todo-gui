/**
 * InteractionController - Interprets UI events and manipulates simulation/navigation.
 *
 * Responsibilities:
 * - Node dragging: pins nodes during drag via SimulationEngine.pinNodes()
 * - Canvas panning: updates ManualNavigator transform
 * - Zoom/rotate: updates ManualNavigator transform
 * - Momentum: sets velocity on ManualNavigator after release
 */

import { SimulationEngine, PinStatus, Position } from "../simulation";
import { Navigator, NavigationState, isManualNavigator } from "../navigation";
import { screenToWorld, Vec2 } from "../rendererUtils";
import { UIEvent, ScreenPoint, InteractionTarget } from "./InputHandler";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dependencies for the InteractionController.
 * Uses getters because engines can be swapped at runtime.
 */
export interface InteractionControllerDeps {
    getSimulationEngine: () => SimulationEngine;
    getNavigator: () => Navigator;
    getNavigationState: () => NavigationState;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Friction coefficient for momentum decay (per second) */
const MOMENTUM_FRICTION = 5;

/** Minimum velocity before momentum stops (pixels per second) */
const MOMENTUM_MIN_VELOCITY = 10;

/** Number of recent positions to track for velocity calculation */
const VELOCITY_SAMPLE_COUNT = 5;

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTION CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

interface VelocitySample {
    position: ScreenPoint;
    time: number;
}

export class InteractionController {
    private deps: InteractionControllerDeps | null;
    private destroyed = false;

    // ─── Node drag state ───
    private draggingNodeId: string | null = null;
    private dragStartWorldPos: Position | null = null;

    // ─── Canvas drag state ───
    private isDraggingCanvas = false;
    private lastDragScreenPos: ScreenPoint | null = null;
    private velocitySamples: VelocitySample[] = [];

    // ─── Touch transform state ───
    private touchTransformActive = false;
    private touchStartTransform: { tx: number; ty: number; scale: number; rotation: number } | null = null;

    constructor(deps: InteractionControllerDeps) {
        this.deps = deps;
    }

    /**
     * Update the simulation engine reference.
     * Called when the engine is swapped at runtime.
     */
    setSimulationEngine(_engine: SimulationEngine): void {
        // Currently unused - deps.getSimulationEngine() is called on each use.
        // This method exists for future use if we need to react to engine changes
        // (e.g., cancel ongoing drags, transfer pin state, etc.)
    }

    /**
     * Update the navigator reference.
     * Called when the navigator is swapped at runtime.
     */
    setNavigator(_navigator: Navigator): void {
        // Currently unused - deps.getNavigator() is called on each use.
        // This method exists for future use if we need to react to navigator changes
        // (e.g., stop momentum, transfer state, etc.)
    }

    /**
     * Process a UI event from InputHandler.
     */
    handleEvent(event: UIEvent): void {
        if (this.destroyed || !this.deps) return;

        switch (event.type) {
            // ─── Mouse/Pointer events ───
            case "drag-start":
                this.handleDragStart(event.target, event.screen);
                break;
            case "drag-move":
                this.handleDragMove(event.target, event.screen);
                break;
            case "drag-end":
                this.handleDragEnd(event.target, event.screen);
                break;
            case "click":
                this.handleClick(event.target, event.screen);
                break;
            case "zoom":
                this.handleZoom(event.screen, event.delta);
                break;

            // ─── Touch events ───
            case "tap":
                this.handleTap(event.target, event.screen);
                break;
            case "long-press":
                this.handleLongPress(event.target, event.screen);
                break;
            case "touch-transform":
                this.handleTouchTransform(event);
                break;
        }
    }

    /**
     * Clean up all state.
     */
    destroy(): void {
        if (this.destroyed) return;

        // Unpin any dragged node
        if (this.draggingNodeId && this.deps) {
            const engine = this.deps.getSimulationEngine();
            const pins = new Map<string, PinStatus>();
            pins.set(this.draggingNodeId, { pinned: false });
            engine.pinNodes(pins);
        }

        // Stop any navigator momentum
        if (this.deps) {
            const nav = this.deps.getNavigator();
            if (isManualNavigator(nav)) {
                nav.stopMomentum();
            }
        }

        // Clear all state
        this.draggingNodeId = null;
        this.dragStartWorldPos = null;
        this.isDraggingCanvas = false;
        this.lastDragScreenPos = null;
        this.velocitySamples = [];
        this.touchTransformActive = false;
        this.touchStartTransform = null;
        this.deps = null;
        this.destroyed = true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DRAG HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    private handleDragStart(target: InteractionTarget, screen: ScreenPoint): void {
        if (!this.deps) return;

        if (target.type === "node") {
            this.startNodeDrag(target.nodeId, screen);
        } else if (target.type === "canvas") {
            this.startCanvasDrag(screen);
        }
    }

    private handleDragMove(target: InteractionTarget, screen: ScreenPoint): void {
        if (!this.deps) return;

        if (this.draggingNodeId) {
            this.updateNodeDrag(screen);
        } else if (this.isDraggingCanvas) {
            this.updateCanvasDrag(screen);
        }
    }

    private handleDragEnd(target: InteractionTarget, screen: ScreenPoint): void {
        if (!this.deps) return;

        if (this.draggingNodeId) {
            this.endNodeDrag();
        } else if (this.isDraggingCanvas) {
            this.endCanvasDrag();
        }
    }

    // ─── Node dragging ───

    private startNodeDrag(nodeId: string, screen: ScreenPoint): void {
        if (!this.deps) return;

        const transform = this.deps.getNavigationState().transform;
        const worldPos = screenToWorld([screen.x, screen.y], transform);

        this.draggingNodeId = nodeId;
        this.dragStartWorldPos = { x: worldPos[0], y: worldPos[1] };

        // Pin the node at its current position
        const engine = this.deps.getSimulationEngine();
        const pins = new Map<string, PinStatus>();
        pins.set(nodeId, { pinned: true, position: this.dragStartWorldPos });
        engine.pinNodes(pins);
    }

    private updateNodeDrag(screen: ScreenPoint): void {
        if (!this.deps || !this.draggingNodeId) return;

        const transform = this.deps.getNavigationState().transform;
        const worldPos = screenToWorld([screen.x, screen.y], transform);

        // Update pin position
        const engine = this.deps.getSimulationEngine();
        const pins = new Map<string, PinStatus>();
        pins.set(this.draggingNodeId, {
            pinned: true,
            position: { x: worldPos[0], y: worldPos[1] },
        });
        engine.pinNodes(pins);
    }

    private endNodeDrag(): void {
        if (!this.deps || !this.draggingNodeId) return;

        // Unpin the node
        const engine = this.deps.getSimulationEngine();
        const pins = new Map<string, PinStatus>();
        pins.set(this.draggingNodeId, { pinned: false });
        engine.pinNodes(pins);

        this.draggingNodeId = null;
        this.dragStartWorldPos = null;
    }

    // ─── Canvas dragging ───

    private startCanvasDrag(screen: ScreenPoint): void {
        if (!this.deps) return;

        const nav = this.deps.getNavigator();
        if (!isManualNavigator(nav)) return;

        // Stop any existing momentum
        nav.stopMomentum();

        this.isDraggingCanvas = true;
        this.lastDragScreenPos = screen;
        this.velocitySamples = [{ position: screen, time: performance.now() }];
    }

    private updateCanvasDrag(screen: ScreenPoint): void {
        if (!this.deps || !this.isDraggingCanvas || !this.lastDragScreenPos) return;

        const nav = this.deps.getNavigator();
        if (!isManualNavigator(nav)) return;

        // Calculate delta and pan
        const dx = screen.x - this.lastDragScreenPos.x;
        const dy = screen.y - this.lastDragScreenPos.y;
        nav.pan(dx, dy);

        // Track for velocity calculation
        this.lastDragScreenPos = screen;
        this.addVelocitySample(screen);
    }

    private endCanvasDrag(): void {
        if (!this.deps || !this.isDraggingCanvas) return;

        const nav = this.deps.getNavigator();
        if (isManualNavigator(nav)) {
            // Calculate release velocity and apply momentum
            const velocity = this.calculateVelocity();
            if (velocity) {
                nav.setVelocity(velocity.vx, velocity.vy);
            }
        }

        this.isDraggingCanvas = false;
        this.lastDragScreenPos = null;
        this.velocitySamples = [];
    }

    // ─── Velocity tracking ───

    private addVelocitySample(position: ScreenPoint): void {
        const now = performance.now();
        this.velocitySamples.push({ position, time: now });

        // Keep only recent samples
        while (this.velocitySamples.length > VELOCITY_SAMPLE_COUNT) {
            this.velocitySamples.shift();
        }
    }

    private calculateVelocity(): { vx: number; vy: number } | null {
        if (this.velocitySamples.length < 2) return null;

        const first = this.velocitySamples[0];
        const last = this.velocitySamples[this.velocitySamples.length - 1];
        const dt = (last.time - first.time) / 1000; // Convert to seconds

        if (dt < 0.001) return null;

        const vx = (last.position.x - first.position.x) / dt;
        const vy = (last.position.y - first.position.y) / dt;

        // Only return if above minimum threshold
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed < MOMENTUM_MIN_VELOCITY) return null;

        return { vx, vy };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ZOOM HANDLER
    // ═══════════════════════════════════════════════════════════════════════

    private handleZoom(screen: ScreenPoint, delta: number): void {
        if (!this.deps) return;

        const nav = this.deps.getNavigator();
        if (!isManualNavigator(nav)) return;

        // Convert delta to zoom factor
        // delta > 0 = zoom in, delta < 0 = zoom out
        const factor = Math.pow(1.1, delta);
        nav.zoom({ x: screen.x, y: screen.y }, factor);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CLICK/TAP HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    private handleClick(target: InteractionTarget, screen: ScreenPoint): void {
        // TODO: Implement click handling (selection, etc.)
        // For now, just log
        if (target.type === "node") {
            console.log("[InteractionController] Click on node:", target.nodeId);
        }
    }

    private handleTap(target: InteractionTarget, screen: ScreenPoint): void {
        // Treat tap same as click for now
        this.handleClick(target, screen);
    }

    private handleLongPress(target: InteractionTarget, screen: ScreenPoint): void {
        // TODO: Implement long-press handling (context menu, etc.)
        if (target.type === "node") {
            console.log("[InteractionController] Long-press on node:", target.nodeId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TOUCH TRANSFORM HANDLER
    // ═══════════════════════════════════════════════════════════════════════

    private handleTouchTransform(event: UIEvent & { type: "touch-transform" }): void {
        if (!this.deps) return;

        const { phase, target, center, translation, scale, rotation } = event;

        switch (phase) {
            case "start":
                this.startTouchTransform(target, center);
                break;
            case "update":
                this.updateTouchTransform(target, center, translation, scale, rotation);
                break;
            case "end":
                this.endTouchTransform();
                break;
            case "cancel":
                this.cancelTouchTransform();
                break;
        }
    }

    private startTouchTransform(target: InteractionTarget, center: ScreenPoint): void {
        if (!this.deps) return;

        if (target.type === "node") {
            // Start node drag
            this.startNodeDrag(target.nodeId, center);
        } else {
            // Start canvas transform
            const nav = this.deps.getNavigator();
            if (isManualNavigator(nav)) {
                nav.stopMomentum();
            }

            this.touchTransformActive = true;
            this.lastDragScreenPos = center;
            this.velocitySamples = [{ position: center, time: performance.now() }];
        }
    }

    private updateTouchTransform(
        target: InteractionTarget,
        center: ScreenPoint,
        translation: ScreenPoint,
        scale: number,
        rotation: number
    ): void {
        if (!this.deps) return;

        if (this.draggingNodeId) {
            // Update node drag position
            this.updateNodeDrag(center);
        } else if (this.touchTransformActive) {
            // Apply canvas transform
            const nav = this.deps.getNavigator();
            if (!isManualNavigator(nav)) return;

            // Apply pan (delta from last position)
            if (this.lastDragScreenPos) {
                const dx = center.x - this.lastDragScreenPos.x;
                const dy = center.y - this.lastDragScreenPos.y;
                nav.pan(dx, dy);
            }

            // Apply zoom if scale changed significantly
            if (Math.abs(scale - 1) > 0.001) {
                nav.zoom({ x: center.x, y: center.y }, scale);
            }

            // Apply rotation if changed significantly
            if (Math.abs(rotation) > 0.001) {
                nav.rotate({ x: center.x, y: center.y }, rotation);
            }

            this.lastDragScreenPos = center;
            this.addVelocitySample(center);
        }
    }

    private endTouchTransform(): void {
        if (!this.deps) return;

        if (this.draggingNodeId) {
            this.endNodeDrag();
        } else if (this.touchTransformActive) {
            // Apply momentum
            const nav = this.deps.getNavigator();
            if (isManualNavigator(nav)) {
                const velocity = this.calculateVelocity();
                if (velocity) {
                    nav.setVelocity(velocity.vx, velocity.vy);
                }
            }

            this.touchTransformActive = false;
            this.lastDragScreenPos = null;
            this.velocitySamples = [];
        }
    }

    private cancelTouchTransform(): void {
        if (!this.deps) return;

        // On cancel, just clean up without momentum
        if (this.draggingNodeId) {
            // Unpin the node (it will snap back via simulation)
            const engine = this.deps.getSimulationEngine();
            const pins = new Map<string, PinStatus>();
            pins.set(this.draggingNodeId, { pinned: false });
            engine.pinNodes(pins);

            this.draggingNodeId = null;
            this.dragStartWorldPos = null;
        }

        this.touchTransformActive = false;
        this.lastDragScreenPos = null;
        this.velocitySamples = [];
    }
}
