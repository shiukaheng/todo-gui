/**
 * InputHandler - Normalizes mouse/touch events into a common UI event interface.
 *
 * Mouse: drag-start/move/end, click, zoom (wheel)
 * Touch: tap, long-press, touch-transform (combined pan/pinch/rotate)
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

export type GesturePhase = "start" | "update" | "end" | "cancel";

export type UIEvent =
    // ─── Mouse/Pointer ───
    | { type: "drag-start"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "drag-move"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "drag-end"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "click"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "zoom"; screen: ScreenPoint; delta: number }

    // ─── Touch: discrete ───
    | { type: "tap"; target: InteractionTarget; screen: ScreenPoint }
    | { type: "long-press"; target: InteractionTarget; screen: ScreenPoint }

    // ─── Touch: continuous transform ───
    | {
          type: "touch-transform";
          phase: GesturePhase;
          target: InteractionTarget;
          center: ScreenPoint;
          translation: ScreenPoint;
          scale: number;
          rotation: number;
      };

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

function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angle(a: ScreenPoint, b: ScreenPoint): number {
    return Math.atan2(b.y - a.y, b.x - a.x);
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
    private touchStartTime: number = 0;
    private touchStartPoint: ScreenPoint | null = null;
    private touchStartTarget: InteractionTarget | null = null;
    private longPressTimer: number | null = null;
    private isTouchTransforming = false;

    // Two-finger gesture baseline
    private twoFingerStartCenter: ScreenPoint | null = null;
    private twoFingerStartDistance: number | null = null;
    private twoFingerStartAngle: number | null = null;

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

        if (e.touches.length === 1) {
            this.handleSingleTouchStart(e.touches[0]);
        } else if (e.touches.length === 2) {
            this.handleTwoFingerStart(e.touches[0], e.touches[1]);
        }
    };

    private onTouchMove = (e: TouchEvent): void => {
        e.preventDefault();

        if (e.touches.length === 1) {
            this.handleSingleTouchMove(e.touches[0]);
        } else if (e.touches.length === 2) {
            this.handleTwoFingerMove(e.touches[0], e.touches[1]);
        }
    };

    private onTouchEnd = (e: TouchEvent): void => {
        if (e.touches.length === 0) {
            this.handleTouchEnd();
        } else if (e.touches.length === 1 && this.isTouchTransforming) {
            // Went from 2 fingers to 1 - end the transform
            this.finishTouchTransform("end");
            // Start single-finger tracking from current position
            this.handleSingleTouchStart(e.touches[0]);
        }
    };

    private onTouchCancel = (_e: TouchEvent): void => {
        this.finishTouchTransform("cancel");
        this.resetTouchState();
    };

    // ─── Single finger ───

    private handleSingleTouchStart(touch: Touch): void {
        this.clearLongPressTimer();

        this.touchStartTime = performance.now();
        this.touchStartPoint = this.getScreenPoint(touch);
        this.touchStartTarget = getTarget(touch.target);
        this.isTouchTransforming = false;

        // Start long-press timer
        this.longPressTimer = window.setTimeout(() => {
            if (this.touchStartPoint && this.touchStartTarget) {
                this.emit({
                    type: "long-press",
                    target: this.touchStartTarget,
                    screen: this.touchStartPoint,
                });
                // After long-press, don't emit tap on release
                this.touchStartPoint = null;
            }
        }, LONG_PRESS_DELAY);
    }

    private handleSingleTouchMove(touch: Touch): void {
        if (!this.touchStartPoint || !this.touchStartTarget) return;

        const current = this.getScreenPoint(touch);
        const dist = distance(this.touchStartPoint, current);

        // If moved beyond threshold, this becomes a transform gesture (pan)
        if (dist >= DRAG_THRESHOLD) {
            this.clearLongPressTimer();

            if (!this.isTouchTransforming) {
                // Start transform
                this.isTouchTransforming = true;
                this.emit({
                    type: "touch-transform",
                    phase: "start",
                    target: this.touchStartTarget,
                    center: this.touchStartPoint,
                    translation: { x: 0, y: 0 },
                    scale: 1,
                    rotation: 0,
                });
            }

            this.emit({
                type: "touch-transform",
                phase: "update",
                target: this.touchStartTarget,
                center: current,
                translation: {
                    x: current.x - this.touchStartPoint.x,
                    y: current.y - this.touchStartPoint.y,
                },
                scale: 1,
                rotation: 0,
            });
        }
    }

    private handleTouchEnd(): void {
        this.clearLongPressTimer();

        if (this.isTouchTransforming) {
            this.finishTouchTransform("end");
        } else if (this.touchStartPoint && this.touchStartTarget) {
            // Check if it was a quick tap
            const elapsed = performance.now() - this.touchStartTime;
            if (elapsed < TAP_MAX_DURATION) {
                this.emit({
                    type: "tap",
                    target: this.touchStartTarget,
                    screen: this.touchStartPoint,
                });
            }
        }

        this.resetTouchState();
    }

    // ─── Two fingers ───

    private handleTwoFingerStart(t1: Touch, t2: Touch): void {
        this.clearLongPressTimer();

        const p1 = this.getScreenPoint(t1);
        const p2 = this.getScreenPoint(t2);

        this.twoFingerStartCenter = midpoint(p1, p2);
        this.twoFingerStartDistance = distance(p1, p2);
        this.twoFingerStartAngle = angle(p1, p2);

        // Use existing target if we were already tracking, otherwise canvas
        const target = this.touchStartTarget ?? { type: "canvas" as const };

        if (!this.isTouchTransforming) {
            this.isTouchTransforming = true;
            this.emit({
                type: "touch-transform",
                phase: "start",
                target,
                center: this.twoFingerStartCenter,
                translation: { x: 0, y: 0 },
                scale: 1,
                rotation: 0,
            });
        }
    }

    private handleTwoFingerMove(t1: Touch, t2: Touch): void {
        if (
            !this.twoFingerStartCenter ||
            !this.twoFingerStartDistance ||
            this.twoFingerStartAngle === null
        ) {
            return;
        }

        const p1 = this.getScreenPoint(t1);
        const p2 = this.getScreenPoint(t2);

        const currentCenter = midpoint(p1, p2);
        const currentDistance = distance(p1, p2);
        const currentAngle = angle(p1, p2);

        const target = this.touchStartTarget ?? { type: "canvas" as const };

        this.emit({
            type: "touch-transform",
            phase: "update",
            target,
            center: currentCenter,
            translation: {
                x: currentCenter.x - this.twoFingerStartCenter.x,
                y: currentCenter.y - this.twoFingerStartCenter.y,
            },
            scale: currentDistance / this.twoFingerStartDistance,
            rotation: currentAngle - this.twoFingerStartAngle,
        });
    }

    private finishTouchTransform(phase: "end" | "cancel"): void {
        if (!this.isTouchTransforming) return;

        const target = this.touchStartTarget ?? { type: "canvas" as const };
        const center = this.twoFingerStartCenter ?? this.touchStartPoint ?? { x: 0, y: 0 };

        this.emit({
            type: "touch-transform",
            phase,
            target,
            center,
            translation: { x: 0, y: 0 },
            scale: 1,
            rotation: 0,
        });

        this.isTouchTransforming = false;
    }

    private clearLongPressTimer(): void {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    private resetTouchState(): void {
        this.clearLongPressTimer();
        this.touchStartTime = 0;
        this.touchStartPoint = null;
        this.touchStartTarget = null;
        this.isTouchTransforming = false;
        this.twoFingerStartCenter = null;
        this.twoFingerStartDistance = null;
        this.twoFingerStartAngle = null;
    }
}
