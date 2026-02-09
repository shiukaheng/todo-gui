/**
 * InputHandler - Normalizes mouse/touch events into a common UI event interface.
 *
 * Mouse: drag-start/move/end, click, zoom (wheel)
 * Touch: Individual finger tracking (finger-down/move/up/cancel)
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ScreenPoint {
    readonly x: number;
    readonly y: number;
}

export type InteractionTarget =
    | { type: "node"; nodeId: string }
    | { type: "edge"; edgeId: string }
    | { type: "canvas" };

export type UIEvent =
    // ─── Mouse/Pointer ───
    | { type: "drag-start"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "drag-move"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "drag-end"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "click"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "zoom"; screen: ScreenPoint; delta: number }

    // ─── Touch: Individual finger tracking ───
    | { type: "finger-down"; fingerId: number; target: InteractionTarget; screen: ScreenPoint }
    | { type: "finger-move"; fingerId: number; screen: ScreenPoint }
    | { type: "finger-up"; fingerId: number; screen: ScreenPoint }
    | { type: "finger-cancel"; fingerId: number; screen: ScreenPoint };

export type UIEventCallback = (event: UIEvent) => void;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DRAG_THRESHOLD = 5; // pixels before mousedown becomes drag
const LONG_PRESS_DELAY = 500; // ms
const TAP_MAX_DURATION = 300; // ms

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getTarget(element: EventTarget | null): InteractionTarget {
    if (!(element instanceof Element)) {
        return { type: "canvas" };
    }

    const nodeGroup = element.closest("[data-node-id]");
    if (nodeGroup instanceof HTMLElement || nodeGroup instanceof SVGElement) {
        const nodeId = nodeGroup.dataset.nodeId;
        if (nodeId) {
            return { type: "node", nodeId };
        }
    }

    const edgeLine = element.closest("[data-edge-id]");
    if (edgeLine instanceof HTMLElement || edgeLine instanceof SVGElement) {
        const edgeId = edgeLine.dataset.edgeId;
        if (edgeId) {
            return { type: "edge", edgeId };
        }
    }

    return { type: "canvas" };
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export class InputHandler {
    private callback: UIEventCallback | null = null;
    private svg: SVGSVGElement;

    // ─── Mouse state ───
    private mouseDownPoint: ScreenPoint | null = null;
    private mouseDownTarget: InteractionTarget | null = null;
    private isDragging = false;

    // ─── Touch state ───
    // Track each finger individually by its identifier
    private activeFingersStartTime = new Map<number, number>();
    private activeFingersStartPos = new Map<number, ScreenPoint>();
    private activeFingersStartTarget = new Map<number, InteractionTarget>();
    private longPressTimer: number | null = null;
    private longPressTriggered = false;

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
        this.attachListeners();
    }

    setCallback(callback: UIEventCallback | null): void {
        this.callback = callback;
    }

    destroy(): void {
        this.detachListeners();
        this.clearLongPressTimer();
        this.callback = null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT LISTENER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    private attachListeners(): void {
        // Mouse
        this.svg.addEventListener("mousedown", this.onMouseDown);
        this.svg.addEventListener("mousemove", this.onMouseMove);
        this.svg.addEventListener("mouseup", this.onMouseUp);
        this.svg.addEventListener("mouseleave", this.onMouseLeave);
        this.svg.addEventListener("wheel", this.onWheel, { passive: false });

        // Touch
        this.svg.addEventListener("touchstart", this.onTouchStart, { passive: false });
        this.svg.addEventListener("touchmove", this.onTouchMove, { passive: false });
        this.svg.addEventListener("touchend", this.onTouchEnd);
        this.svg.addEventListener("touchcancel", this.onTouchCancel);
    }

    private detachListeners(): void {
        this.svg.removeEventListener("mousedown", this.onMouseDown);
        this.svg.removeEventListener("mousemove", this.onMouseMove);
        this.svg.removeEventListener("mouseup", this.onMouseUp);
        this.svg.removeEventListener("mouseleave", this.onMouseLeave);
        this.svg.removeEventListener("wheel", this.onWheel);

        this.svg.removeEventListener("touchstart", this.onTouchStart);
        this.svg.removeEventListener("touchmove", this.onTouchMove);
        this.svg.removeEventListener("touchend", this.onTouchEnd);
        this.svg.removeEventListener("touchcancel", this.onTouchCancel);
    }

    private emit(event: UIEvent): void {
        this.callback?.(event);
    }

    private getScreenPoint(e: MouseEvent | Touch): ScreenPoint {
        const rect = this.svg.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MOUSE HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    private onMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return; // left click only

        this.mouseDownPoint = this.getScreenPoint(e);
        this.mouseDownTarget = getTarget(e.target);
        this.isDragging = false;
    };

    private onMouseMove = (e: MouseEvent): void => {
        if (!this.mouseDownPoint || !this.mouseDownTarget) return;

        const current = this.getScreenPoint(e);

        if (!this.isDragging) {
            // Check if we've moved enough to start dragging
            if (distance(this.mouseDownPoint, current) >= DRAG_THRESHOLD) {
                this.isDragging = true;
                this.emit({
                    type: "drag-start",
                    target: this.mouseDownTarget,
                    screen: current, // Use current position, not mouseDownPoint
                });
            }
        }

        if (this.isDragging) {
            this.emit({
                type: "drag-move",
                target: this.mouseDownTarget,
                screen: current,
            });
        }
    };

    private onMouseUp = (e: MouseEvent): void => {
        if (!this.mouseDownPoint || !this.mouseDownTarget) return;

        const current = this.getScreenPoint(e);

        if (this.isDragging) {
            this.emit({
                type: "drag-end",
                target: this.mouseDownTarget,
                screen: current,
            });
        } else {
            // No drag occurred = click
            this.emit({
                type: "click",
                target: this.mouseDownTarget,
                screen: current,
            });
        }

        this.resetMouseState();
    };

    private onMouseLeave = (_e: MouseEvent): void => {
        if (this.isDragging && this.mouseDownTarget) {
            // Treat leaving as drag-end at last known position
            this.emit({
                type: "drag-end",
                target: this.mouseDownTarget,
                screen: this.mouseDownPoint!,
            });
        }
        this.resetMouseState();
    };

    private onWheel = (e: WheelEvent): void => {
        e.preventDefault();
        const screen = this.getScreenPoint(e);
        // Normalize delta: positive = zoom in, negative = zoom out
        const delta = -e.deltaY / 100;
        this.emit({ type: "zoom", screen, delta });
    };

    private resetMouseState(): void {
        this.mouseDownPoint = null;
        this.mouseDownTarget = null;
        this.isDragging = false;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TOUCH HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    private onTouchStart = (e: TouchEvent): void => {
        e.preventDefault();

        // Process all changed touches (new touches that just started)
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const fingerId = touch.identifier;
            const screen = this.getScreenPoint(touch);
            const target = getTarget(touch.target);

            // Track this finger
            this.activeFingersStartTime.set(fingerId, performance.now());
            this.activeFingersStartPos.set(fingerId, screen);
            this.activeFingersStartTarget.set(fingerId, target);

            // Emit finger-down event
            this.emit({ type: "finger-down", fingerId, target, screen });

            // Start long-press timer if this is the first (and only) finger
            if (e.touches.length === 1) {
                this.longPressTriggered = false;
                this.longPressTimer = window.setTimeout(() => {
                    const startPos = this.activeFingersStartPos.get(fingerId);
                    const startTarget = this.activeFingersStartTarget.get(fingerId);
                    if (startPos && startTarget && !this.longPressTriggered) {
                        this.longPressTriggered = true;
                        // Note: We don't emit finger events for long-press - just for compatibility
                        // InteractionController can handle this if needed
                    }
                }, LONG_PRESS_DELAY);
            } else {
                // Multiple fingers - cancel long press
                this.clearLongPressTimer();
            }
        }
    };

    private onTouchMove = (e: TouchEvent): void => {
        e.preventDefault();

        // Cancel long-press if finger moved significantly
        if (this.longPressTimer && e.touches.length === 1) {
            const touch = e.touches[0];
            const startPos = this.activeFingersStartPos.get(touch.identifier);
            if (startPos) {
                const current = this.getScreenPoint(touch);
                if (distance(startPos, current) >= DRAG_THRESHOLD) {
                    this.clearLongPressTimer();
                }
            }
        }

        // Emit finger-move for all current touches
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const fingerId = touch.identifier;
            const screen = this.getScreenPoint(touch);

            this.emit({ type: "finger-move", fingerId, screen });
        }
    };

    private onTouchEnd = (e: TouchEvent): void => {
        // Process all touches that just ended
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const fingerId = touch.identifier;
            const screen = this.getScreenPoint(touch);

            // Check if this was a tap (single finger, quick, didn't move much)
            if (e.touches.length === 0 && !this.longPressTriggered) {
                const startTime = this.activeFingersStartTime.get(fingerId);
                const startPos = this.activeFingersStartPos.get(fingerId);
                const startTarget = this.activeFingersStartTarget.get(fingerId);

                if (startTime && startPos && startTarget) {
                    const elapsed = performance.now() - startTime;
                    const dist = distance(startPos, screen);

                    if (elapsed < TAP_MAX_DURATION && dist < DRAG_THRESHOLD) {
                        // Emit tap event for compatibility
                        this.emit({ type: "click", target: startTarget, screen });
                    }
                }
            }

            // Emit finger-up event
            this.emit({ type: "finger-up", fingerId, screen });

            // Clean up tracking
            this.activeFingersStartTime.delete(fingerId);
            this.activeFingersStartPos.delete(fingerId);
            this.activeFingersStartTarget.delete(fingerId);
        }

        // Clear long-press timer when all fingers are lifted
        if (e.touches.length === 0) {
            this.clearLongPressTimer();
        }
    };

    private onTouchCancel = (e: TouchEvent): void => {
        // Cancel all active fingers
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const fingerId = touch.identifier;
            const screen = this.getScreenPoint(touch);

            this.emit({ type: "finger-cancel", fingerId, screen });

            // Clean up tracking
            this.activeFingersStartTime.delete(fingerId);
            this.activeFingersStartPos.delete(fingerId);
            this.activeFingersStartTarget.delete(fingerId);
        }

        this.clearLongPressTimer();
    };

    private clearLongPressTimer(): void {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }
}
