import { INavigator, TransformChangeCallback } from "./INavigator";

/**
 * GraphNavigator handles user navigation of the graph view
 * Manages pan, zoom, and other view transformations
 */

export interface ViewTransform {
    a: number;  // x-scale / cos(rotation)
    b: number;  // y-skew / sin(rotation)
    c: number;  // x-skew / -sin(rotation)
    d: number;  // y-scale / cos(rotation)
    tx: number; // x-translation
    ty: number; // y-translation
}

interface Position {
    x: number;
    y: number;
}

/**
 * Manual navigation implementation - responds to user mouse/touch input
 */
export class GraphNavigator implements INavigator {
    private transform: ViewTransform;
    private transformChangeCallback: TransformChangeCallback | null = null;
    
    private isDragging: boolean = false;
    private lastPosition: Position | null = null;
    private pinchStartDistance: number | null = null;
    
    private svgSize: { width: number; height: number };

    constructor(
        initialScale: number,
        svgSize: { width: number; height: number }
    ) {
        this.svgSize = svgSize;
        
        // Initialize with identity transform, scaled, centered at origin
        this.transform = {
            a: initialScale,
            b: 0,
            c: 0,
            d: initialScale,
            tx: svgSize.width / 2,
            ty: svgSize.height / 2
        };
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
        const oldSize = this.svgSize;
        this.svgSize = { width, height };
        
        // Adjust translation to maintain the same center point
        // If the window resizes, we want to keep the view centered on the same world position
        const dx = (width - oldSize.width) / 2;
        const dy = (height - oldSize.height) / 2;
        
        this.transform.tx += dx;
        this.transform.ty += dy;
        this.notifyTransformChange();
    }

    public getEventHandlers() {
        return {
            onMouseDown: this.handleMouseDown.bind(this),
            onMouseMove: this.handleMouseMove.bind(this),
            onMouseUp: this.handleMouseUp.bind(this),
            onWheel: this.handleWheel.bind(this),
            onTouchStart: this.handleTouchStart.bind(this),
            onTouchMove: this.handleTouchMove.bind(this),
            onTouchEnd: this.handleTouchEnd.bind(this)
        };
    }

    public activate(): void {
        // Nothing special needed for manual navigation
    }

    public deactivate(): void {
        // Clean up any ongoing interactions
        this.isDragging = false;
        this.lastPosition = null;
        this.pinchStartDistance = null;
    }

    public destroy(): void {
        this.deactivate();
    }

    // ===== Legacy Public Methods (kept for compatibility) =====

    /**
     * Update the canvas size (e.g., on window resize)
     * @deprecated Use updateSize instead
     */
    public updateCanvasSize(width: number, height: number): void {
        this.updateSize(width, height);
    }

    /**
     * Get the current transform
     * @deprecated Use getTransform instead
     */
    public getCurrentTransform(): ViewTransform {
        return this.getTransform();
    }

    // ===== Coordinate Conversion Utilities =====

    /**
     * Transform world coordinates to screen coordinates
     */
    public worldToScreen(worldX: number, worldY: number): [number, number] {
        const screenX = this.transform.a * worldX + this.transform.c * worldY + this.transform.tx;
        const screenY = this.transform.b * worldX + this.transform.d * worldY + this.transform.ty;
        return [screenX, screenY];
    }

    /**
     * Transform screen coordinates to world coordinates
     */
    public screenToWorld(screenX: number, screenY: number): [number, number] {
        const det = this.transform.a * this.transform.d - this.transform.b * this.transform.c;
        if (Math.abs(det) < 1e-10) {
            return [0, 0];
        }
        
        const dx = screenX - this.transform.tx;
        const dy = screenY - this.transform.ty;
        
        const worldX = (this.transform.d * dx - this.transform.c * dy) / det;
        const worldY = (-this.transform.b * dx + this.transform.a * dy) / det;
        
        return [worldX, worldY];
    }

    // ===== Mouse Event Handlers =====

    public handleMouseDown(event: MouseEvent): void {
        this.isDragging = true;
        this.lastPosition = { x: event.clientX, y: event.clientY };
    }

    public handleMouseMove(event: MouseEvent): void {
        // Handle case where we switched to this navigator mid-drag
        // (e.g., auto-switch from auto mode when user starts dragging)
        if (!this.isDragging && (event.buttons & 1) !== 0) {
            this.isDragging = true;
            this.lastPosition = { x: event.clientX, y: event.clientY };
            return;
        }

        if (!this.isDragging || !this.lastPosition) return;

        const dx = event.clientX - this.lastPosition.x;
        const dy = event.clientY - this.lastPosition.y;
        this.lastPosition = { x: event.clientX, y: event.clientY };

        // Pan by updating translation
        this.transform.tx += dx;
        this.transform.ty += dy;
        this.notifyTransformChange();
    }

    public handleMouseUp(): void {
        this.isDragging = false;
        this.lastPosition = null;
    }

    public handleWheel(event: WheelEvent, svgX: number, svgY: number): void {
        const scaleFactor = 1 - event.deltaY / 500;
        this.zoom(svgX, svgY, scaleFactor);
    }

    // ===== Touch Event Handlers =====

    public handleTouchStart(event: TouchEvent): void {
        if (event.touches.length === 1) {
            this.isDragging = true;
            this.lastPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        } else if (event.touches.length === 2) {
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            this.pinchStartDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }

    public handleTouchMove(event: TouchEvent, svgRect: DOMRect): void {
        if (event.touches.length === 1 && this.isDragging && this.lastPosition) {
            const dx = event.touches[0].clientX - this.lastPosition.x;
            const dy = event.touches[0].clientY - this.lastPosition.y;
            this.lastPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            
            this.transform.tx += dx;
            this.transform.ty += dy;
            this.notifyTransformChange();
        } else if (event.touches.length === 2 && this.pinchStartDistance !== null) {
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const scaleFactor = distance / this.pinchStartDistance;
            this.pinchStartDistance = distance;

            const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
            const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
            
            this.zoom(centerX - svgRect.left, centerY - svgRect.top, scaleFactor);
        }
    }

    public handleTouchEnd(): void {
        this.isDragging = false;
        this.lastPosition = null;
        this.pinchStartDistance = null;
    }

    // ===== Private Methods =====

    private zoom(screenX: number, screenY: number, scaleFactor: number): void {
        // Get world coordinates of the zoom center before scaling
        const [worldX, worldY] = this.screenToWorld(screenX, screenY);
        
        // Apply scale to the transformation matrix
        this.transform.a *= scaleFactor;
        this.transform.b *= scaleFactor;
        this.transform.c *= scaleFactor;
        this.transform.d *= scaleFactor;
        
        // Adjust translation to keep the zoom center at the same screen position
        const [newScreenX, newScreenY] = this.worldToScreen(worldX, worldY);
        this.transform.tx += screenX - newScreenX;
        this.transform.ty += screenY - newScreenY;
        
        this.notifyTransformChange();
    }

    private notifyTransformChange(): void {
        if (this.transformChangeCallback) {
            this.transformChangeCallback(this.getTransform());
        }
    }
}
