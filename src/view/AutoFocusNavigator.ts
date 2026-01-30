import { INavigator, TransformChangeCallback } from "./INavigator";
import { ViewTransform } from "./GraphNavigator";

/**
 * Auto-focus navigator that smoothly centers and zooms to a selected node
 * Does not respond to user input - purely automatic
 */
export class AutoFocusNavigator implements INavigator {
    private transform: ViewTransform;
    private transformChangeCallback: TransformChangeCallback | null = null;
    private svgSize: { width: number; height: number };
    
    private targetNodePosition: [number, number] | null = null;
    private targetUpVector: [number, number] | null = null; // World-space up vector for rotation
    private targetScale: number = 150; // Zoom level when focused on a node
    private animationFrameId: number | null = null;
    private animationSpeed: number = 2.0; // Speed in units per second
    private lastFrameTime: number | null = null;

    constructor(
        initialTransform: ViewTransform,
        svgSize: { width: number; height: number }
    ) {
        this.transform = { ...initialTransform };
        this.svgSize = svgSize;
    }

    // ===== INavigator Interface Implementation =====

    public getTransform(): ViewTransform {
        return { ...this.transform };
    }

    public setTransform(transform: ViewTransform): void {
        this.transform = { ...transform };
        this.notifyTransformChange();
    }

    public setTransformChangeCallback(callback: TransformChangeCallback | null): void {
        this.transformChangeCallback = callback;
    }

    public updateSize(width: number, height: number): void {
        this.svgSize = { width, height };
        // Don't auto-center - maintain current focus
    }

    public getEventHandlers() {
        // Auto-focus navigator doesn't respond to user input
        return {};
    }

    public activate(): void {
        // Start animation loop when activated
        this.startAnimationLoop();
    }

    public deactivate(): void {
        // Stop animation loop when deactivated
        this.stopAnimationLoop();
    }

    public destroy(): void {
        this.stopAnimationLoop();
    }

    // ===== Auto-Focus Specific Methods =====

    /**
     * Focus on a specific node position with smooth animation
     * @param worldX - X coordinate in world space
     * @param worldY - Y coordinate in world space
     * @param scale - Optional zoom level
     * @param up - Optional world-space vector that should point "up" on screen (causes rotation)
     */
    public focusOn(worldX: number, worldY: number, scale?: number, up?: [number, number]): void {
        this.targetNodePosition = [worldX, worldY];
        if (scale !== undefined) {
            this.targetScale = scale;
        }
        if (up !== undefined) {
            this.targetUpVector = up;
        }
    }

    /**
     * Clear focus and return to default view
     */
    public clearFocus(): void {
        this.targetNodePosition = null;
        this.targetUpVector = null;
        // Could animate back to a default view here
    }

    /**
     * Set animation speed (units per second)
     * Higher values = faster animation (e.g., 5.0 = smooth, 20.0 = snappy)
     */
    public setAnimationSpeed(speed: number): void {
        this.animationSpeed = Math.max(0, speed);
    }

    // ===== Private Methods =====

    private startAnimationLoop(): void {
        if (this.animationFrameId !== null) return;
        
        this.lastFrameTime = null; // Reset time tracking
        
        const animate = (timestamp: number) => {
            this.updateAnimation(timestamp);
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }

    private stopAnimationLoop(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.lastFrameTime = null;
    }

    private updateAnimation(timestamp: number): void {
        if (!this.targetNodePosition) return;

        // Calculate delta time in seconds
        const dt = this.lastFrameTime !== null ? (timestamp - this.lastFrameTime) / 1000 : 0;
        this.lastFrameTime = timestamp;

        // Skip first frame (dt = 0)
        if (dt === 0) return;

        const [targetWorldX, targetWorldY] = this.targetNodePosition;
        
        // Calculate rotation angle if up vector is specified
        let rotationAngle = 0;
        if (this.targetUpVector) {
            const [upX, upY] = this.targetUpVector;
            // Calculate angle to rotate so that (upX, upY) points up on screen
            // Screen "up" is (0, -1) since Y increases downward
            rotationAngle = Math.atan2(upX, upY);
        }
        
        // Calculate target transform with rotation
        // For rotation θ and scale s: a=s*cos(θ), b=s*sin(θ), c=-s*sin(θ), d=s*cos(θ)
        const cos = Math.cos(rotationAngle);
        const sin = Math.sin(rotationAngle);
        const targetTransform: ViewTransform = {
            a: this.targetScale * cos,
            b: this.targetScale * sin,
            c: -this.targetScale * sin,
            d: this.targetScale * cos,
            tx: this.svgSize.width / 2 - (targetWorldX * this.targetScale * cos - targetWorldY * this.targetScale * sin),
            ty: this.svgSize.height / 2 - (targetWorldX * this.targetScale * sin + targetWorldY * this.targetScale * cos)
        };

        // Smooth interpolation towards target using delta time
        // t = 1 - e^(-speed * dt) provides smooth exponential interpolation
        const t = 1 - Math.exp(-this.animationSpeed * dt);
        const changed = this.interpolateTransform(this.transform, targetTransform, t);

        if (changed) {
            this.notifyTransformChange();
        }
    }

    private interpolateTransform(
        current: ViewTransform, 
        target: ViewTransform, 
        t: number
    ): boolean {
        let changed = false;
        const threshold = 0.01; // Stop animating when close enough

        // Interpolate each component
        const lerp = (a: number, b: number) => a + (b - a) * t;

        if (Math.abs(current.a - target.a) > threshold) {
            current.a = lerp(current.a, target.a);
            changed = true;
        } else {
            current.a = target.a;
        }

        if (Math.abs(current.b - target.b) > threshold) {
            current.b = lerp(current.b, target.b);
            changed = true;
        } else {
            current.b = target.b;
        }

        if (Math.abs(current.c - target.c) > threshold) {
            current.c = lerp(current.c, target.c);
            changed = true;
        } else {
            current.c = target.c;
        }

        if (Math.abs(current.d - target.d) > threshold) {
            current.d = lerp(current.d, target.d);
            changed = true;
        } else {
            current.d = target.d;
        }

        if (Math.abs(current.tx - target.tx) > threshold) {
            current.tx = lerp(current.tx, target.tx);
            changed = true;
        } else {
            current.tx = target.tx;
        }

        if (Math.abs(current.ty - target.ty) > threshold) {
            current.ty = lerp(current.ty, target.ty);
            changed = true;
        } else {
            current.ty = target.ty;
        }

        return changed;
    }

    private notifyTransformChange(): void {
        if (this.transformChangeCallback) {
            this.transformChangeCallback(this.getTransform());
        }
    }
}
