/**
 * InteractionController - Interprets UI events and manipulates simulation/navigation.
 *
 * Responsibilities:
 * - Node dragging: pins nodes during drag via SimulationEngine.pinNodes()
 * - Canvas panning: updates ManualNavigationEngine transform
 * - Zoom/rotate: updates ManualNavigationEngine transform
 * - Momentum: sets velocity on ManualNavigationEngine after release
 */

import { SimulationEngine, SimulationState, PinStatus, Position } from "../simulation";
import { NavigationEngine, NavigationState, isManualNavigationEngine } from "../navigation";
import { screenToWorld, Vec2 } from "../render/utils";
import { UIEvent, ScreenPoint, InteractionTarget } from "./InputHandler";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dependencies for the InteractionController.
 * Provides getters and setters for engines, allowing the controller
 * to both read current state and request engine changes (e.g., switch
 * to manual navigation when user starts dragging).
 */
export interface InteractionControllerDeps {
    getSimulationEngine: () => SimulationEngine;
    setSimulationEngine: (engine: SimulationEngine) => void;
    getNavigationEngine: () => NavigationEngine;
    setNavigationEngine: (engine: NavigationEngine) => void;
    getNavigationState: () => NavigationState;
    getSimulationState: () => SimulationState;
    onNodeClick?: (nodeId: string) => void;
    onCanvasTap?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

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
    private dragOffset: Position | null = null; // Offset from cursor to node center (world coords)
    private currentDragScreenPos: ScreenPoint | null = null; // Current mouse screen position during drag

    // ─── Canvas drag state ───
    private isDraggingCanvas = false;
    private lastDragScreenPos: ScreenPoint | null = null;
    private velocitySamples: VelocitySample[] = [];

    // ─── Touch finger tracking ───
    private activeFingers = new Map<number, { start: ScreenPoint; current: ScreenPoint; target: InteractionTarget }>();
    private fingerTransformBaseline: { center: ScreenPoint; scale: number; rotation: number } | null = null;

    constructor(deps: InteractionControllerDeps) {
        this.deps = deps;
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

            // ─── Touch: Gestures ───
            case "tap":
                this.handleTap(event.target, event.screen);
                break;

            // ─── Touch: Individual finger tracking ───
            case "finger-down":
                this.handleFingerDown(event.fingerId, event.target, event.screen);
                break;
            case "finger-move":
                this.handleFingerMove(event.fingerId, event.screen);
                break;
            case "finger-up":
                this.handleFingerUp(event.fingerId, event.screen);
                break;
            case "finger-cancel":
                this.handleFingerCancel(event.fingerId, event.screen);
                break;
        }
    }

    /**
     * Update drag position every frame to handle simulation inertia.
     * Called from the main animation loop.
     */
    updateFrame(): void {
        if (this.draggingNodeId && this.currentDragScreenPos) {
            this.applyCurrentDragPosition();
        }
    }

    /**
     * Check if currently dragging a node (used by navigation engines to pause following).
     */
    isDraggingNode(): boolean {
        return this.draggingNodeId !== null;
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

        // Stop any navigation engine momentum
        if (this.deps) {
            const nav = this.deps.getNavigationEngine();
            if (isManualNavigationEngine(nav)) {
                nav.stopMomentum();
            }
        }

        // Clear all state
        this.draggingNodeId = null;
        this.dragOffset = null;
        this.isDraggingCanvas = false;
        this.lastDragScreenPos = null;
        this.velocitySamples = [];
        this.activeFingers.clear();
        this.fingerTransformBaseline = null;
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

        // CRITICAL: Set dragging state FIRST before any calculations
        // This ensures isDraggingNode() returns true immediately
        this.draggingNodeId = nodeId;
        this.currentDragScreenPos = screen;

        const transform = this.deps.getNavigationState().transform;
        const cursorWorld = screenToWorld([screen.x, screen.y], transform);

        // Get node's current world position
        const simState = this.deps.getSimulationState();
        const nodePos = simState.positions[nodeId];
        if (!nodePos) {
            // Reset if node not found
            this.draggingNodeId = null;
            this.currentDragScreenPos = null;
            return;
        }

        // Store offset from cursor to node center (so node doesn't jump)
        this.dragOffset = {
            x: nodePos.x - cursorWorld[0],
            y: nodePos.y - cursorWorld[1],
        };


        // Pin the node at its current position
        const engine = this.deps.getSimulationEngine();
        const pins = new Map<string, PinStatus>();
        pins.set(nodeId, { pinned: true, position: nodePos });
        engine.pinNodes(pins);
    }

    private updateNodeDrag(screen: ScreenPoint): void {
        if (!this.deps || !this.draggingNodeId || !this.dragOffset) return;

        // Update the current screen position
        this.currentDragScreenPos = screen;

        // Recalculate and update the pin position
        this.applyCurrentDragPosition();
    }

    /**
     * Apply the current drag position based on stored screen position and current transform.
     * Called when mouse moves AND every frame to handle simulation inertia.
     */
    private applyCurrentDragPosition(): void {
        if (!this.deps || !this.draggingNodeId || !this.dragOffset || !this.currentDragScreenPos) return;

        const transform = this.deps.getNavigationState().transform;
        const cursorWorld = screenToWorld(
            [this.currentDragScreenPos.x, this.currentDragScreenPos.y],
            transform
        );

        // Apply offset to keep node at same relative position to cursor
        const newPos: Position = {
            x: cursorWorld[0] + this.dragOffset.x,
            y: cursorWorld[1] + this.dragOffset.y,
        };


        // Update pin position
        const engine = this.deps.getSimulationEngine();
        const pins = new Map<string, PinStatus>();
        pins.set(this.draggingNodeId, { pinned: true, position: newPos });
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
        this.dragOffset = null;
        this.currentDragScreenPos = null;
    }

    // ─── Canvas dragging ───

    private startCanvasDrag(screen: ScreenPoint): void {
        if (!this.deps) return;

        const nav = this.deps.getNavigationEngine();
        if (!isManualNavigationEngine(nav)) return;

        // Stop any existing momentum
        nav.stopMomentum();

        this.isDraggingCanvas = true;
        this.lastDragScreenPos = screen;
        this.velocitySamples = [{ position: screen, time: performance.now() }];
    }

    private updateCanvasDrag(screen: ScreenPoint): void {
        if (!this.deps || !this.isDraggingCanvas || !this.lastDragScreenPos) return;

        const nav = this.deps.getNavigationEngine();
        if (!isManualNavigationEngine(nav)) return;

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

        const nav = this.deps.getNavigationEngine();
        if (isManualNavigationEngine(nav)) {
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

        // Use only the last 2 samples for instantaneous velocity at release
        // This prevents "speeding back up" when user slows down before releasing
        const prev = this.velocitySamples[this.velocitySamples.length - 2];
        const last = this.velocitySamples[this.velocitySamples.length - 1];
        const dt = (last.time - prev.time) / 1000; // Convert to seconds

        // If too much time has passed since last sample, user has stopped moving
        const timeSinceLastSample = (performance.now() - last.time) / 1000;
        if (timeSinceLastSample > 0.1) {
            // More than 100ms since last movement - no momentum
            return null;
        }

        if (dt < 0.001) return null;

        const vx = (last.position.x - prev.position.x) / dt;
        const vy = (last.position.y - prev.position.y) / dt;

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

        const nav = this.deps.getNavigationEngine();
        if (!isManualNavigationEngine(nav)) return;

        // Convert delta to zoom factor
        // delta > 0 = zoom in, delta < 0 = zoom out
        const factor = Math.pow(1.1, delta);
        nav.zoom({ x: screen.x, y: screen.y }, factor);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CLICK/TAP HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    private handleClick(target: InteractionTarget, screen: ScreenPoint): void {
        // Mouse click: only handle node clicks, not canvas
        if (target.type === "node") {
            this.deps?.onNodeClick?.(target.nodeId);
        }
    }

    private handleTap(target: InteractionTarget, screen: ScreenPoint): void {
        // Touch tap: handle both node taps and canvas taps
        if (target.type === "node") {
            this.deps?.onNodeClick?.(target.nodeId);
        } else if (target.type === "canvas") {
            // Don't open command plane if an input is currently focused
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
                return;
            }
            this.deps?.onCanvasTap?.();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FINGER TRACKING HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    private handleFingerDown(fingerId: number, target: InteractionTarget, screen: ScreenPoint): void {
        if (!this.deps) return;

        // Track this finger
        this.activeFingers.set(fingerId, { start: screen, current: screen, target });

        // If this is the first finger on a node, start node drag
        if (this.activeFingers.size === 1 && target.type === "node") {
            this.startNodeDrag(target.nodeId, screen);
        }

        // If we now have 2+ fingers, stop any momentum and establish baseline
        if (this.activeFingers.size >= 2) {
            const nav = this.deps.getNavigationEngine();
            if (isManualNavigationEngine(nav)) {
                nav.stopMomentum();
            }
            this.fingerTransformBaseline = this.computeFingerGeometry(this.activeFingers);
            this.velocitySamples = [];
        }
    }

    private handleFingerMove(fingerId: number, screen: ScreenPoint): void {
        if (!this.deps) return;

        const finger = this.activeFingers.get(fingerId);
        if (!finger) return;

        // Update current position
        finger.current = screen;

        if (this.draggingNodeId && this.activeFingers.size === 1) {
            // Single finger dragging a node
            this.updateNodeDrag(screen);
        } else if (this.activeFingers.size === 1) {
            // Single finger canvas drag (pan only)
            const nav = this.deps.getNavigationEngine();
            if (!isManualNavigationEngine(nav)) return;

            const dx = screen.x - finger.start.x;
            const dy = screen.y - finger.start.y;

            // Use incremental pan for single finger
            if (this.lastDragScreenPos) {
                const idx = screen.x - this.lastDragScreenPos.x;
                const idy = screen.y - this.lastDragScreenPos.y;
                nav.pan(idx, idy);
            }

            this.lastDragScreenPos = screen;
            this.addVelocitySample(screen);
        } else if (this.activeFingers.size >= 2) {
            // Multi-finger: compute transform
            this.applyFingerTransform();
        }
    }

    private handleFingerUp(fingerId: number, screen: ScreenPoint): void {
        if (!this.deps) return;

        const finger = this.activeFingers.get(fingerId);
        if (!finger) return;

        // Update final position
        finger.current = screen;

        const wasMultiFinger = this.activeFingers.size >= 2;

        // Remove this finger
        this.activeFingers.delete(fingerId);

        if (this.activeFingers.size === 0) {
            // All fingers lifted
            if (this.draggingNodeId) {
                this.endNodeDrag();
            } else {
                // Apply momentum if we were panning
                const nav = this.deps.getNavigationEngine();
                if (isManualNavigationEngine(nav)) {
                    const velocity = this.calculateVelocity();
                    if (velocity) {
                        nav.setVelocity(velocity.vx, velocity.vy);
                    }
                }
            }

            this.lastDragScreenPos = null;
            this.velocitySamples = [];
            this.fingerTransformBaseline = null;
        } else if (wasMultiFinger && this.activeFingers.size === 1) {
            // Went from multi-finger to single finger - reset baseline
            this.fingerTransformBaseline = null;
            this.velocitySamples = [];

            // Reset lastDragScreenPos for single finger panning
            const remainingFinger = this.activeFingers.values().next().value;
            if (remainingFinger) {
                this.lastDragScreenPos = remainingFinger.current;
            }
        } else if (this.activeFingers.size >= 2) {
            // Still have multiple fingers - update baseline
            this.fingerTransformBaseline = this.computeFingerGeometry(this.activeFingers);
        }
    }

    private handleFingerCancel(fingerId: number, screen: ScreenPoint): void {
        // Treat cancel same as finger up, but without momentum
        const finger = this.activeFingers.get(fingerId);
        if (!finger) return;

        this.activeFingers.delete(fingerId);

        if (this.activeFingers.size === 0) {
            if (this.draggingNodeId) {
                // Unpin the node
                const engine = this.deps.getSimulationEngine();
                const pins = new Map<string, PinStatus>();
                pins.set(this.draggingNodeId, { pinned: false });
                engine.pinNodes(pins);

                this.draggingNodeId = null;
                this.dragOffset = null;
            }

            this.lastDragScreenPos = null;
            this.velocitySamples = [];
            this.fingerTransformBaseline = null;
        }
    }

    private computeFingerGeometry(fingers: Map<number, { start: ScreenPoint; current: ScreenPoint; target: InteractionTarget }>): { center: ScreenPoint; scale: number; rotation: number } {
        const positions: ScreenPoint[] = [];
        for (const finger of fingers.values()) {
            positions.push(finger.current);
        }

        // Compute center
        const center = {
            x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
            y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
        };

        // For 2+ fingers, compute scale and rotation from first two fingers
        if (positions.length >= 2) {
            const dx = positions[1].x - positions[0].x;
            const dy = positions[1].y - positions[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            return { center, scale: distance, rotation: angle };
        }

        return { center, scale: 1, rotation: 0 };
    }

    private applyFingerTransform(): void {
        if (!this.deps || !this.fingerTransformBaseline || this.activeFingers.size < 2) return;

        const current = this.computeFingerGeometry(this.activeFingers);
        const baseline = this.fingerTransformBaseline;

        // Compute deltas
        const scaleFactor = current.scale / baseline.scale;
        const rotationDelta = current.rotation - baseline.rotation;
        const translationDelta = {
            x: current.center.x - baseline.center.x,
            y: current.center.y - baseline.center.y,
        };

        const nav = this.deps.getNavigationEngine();
        if (!isManualNavigationEngine(nav)) return;

        // Apply as incremental transform
        // Order: translate to baseline center, rotate, scale, translate back, then translate delta
        const cos = Math.cos(rotationDelta);
        const sin = Math.sin(rotationDelta);

        // Build the incremental transform matrix
        // T(delta) * T(center) * R * S * T(-center)
        const cx = baseline.center.x;
        const cy = baseline.center.y;

        // Combined transform: translate(-cx, -cy) -> scale -> rotate -> translate(cx, cy) -> translate(delta)
        const a = scaleFactor * cos;
        const b = scaleFactor * sin;
        const c = -scaleFactor * sin;
        const d = scaleFactor * cos;
        const tx = -cx * a - cy * c + cx + translationDelta.x;
        const ty = -cx * b - cy * d + cy + translationDelta.y;

        nav.applyTransform({ a, b, c, d, tx, ty });

        // Update baseline to current
        this.fingerTransformBaseline = current;

        // Track for momentum (use center movement)
        this.addVelocitySample(current.center);
    }
}
