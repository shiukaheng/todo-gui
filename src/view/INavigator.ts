import { ViewTransform } from "./GraphNavigator";
import { 
    MouseDownCallback, 
    MouseMoveCallback, 
    MouseUpCallback, 
    WheelCallback, 
    TouchStartCallback, 
    TouchMoveCallback, 
    TouchEndCallback 
} from "./GraphVisualizer";

/**
 * Callback when the navigator wants to update the view transform
 */
export type TransformChangeCallback = (transform: ViewTransform) => void;

/**
 * Interface for all navigator implementations
 * Navigators control how the view transform changes in response to user input or other events
 */
export interface INavigator {
    /**
     * Get the current transform
     */
    getTransform(): ViewTransform;
    
    /**
     * Set the transform directly
     */
    setTransform(transform: ViewTransform): void;
    
    /**
     * Set the callback for when transform changes
     * This is called by the visualizer when attaching the navigator
     */
    setTransformChangeCallback(callback: TransformChangeCallback | null): void;
    
    /**
     * Update the canvas size (e.g., on window resize)
     */
    updateSize(width: number, height: number): void;
    
    /**
     * Get event handlers that should be wired to the visualizer
     * Returns null for handlers this navigator doesn't need
     */
    getEventHandlers(): {
        onMouseDown?: MouseDownCallback;
        onMouseMove?: MouseMoveCallback;
        onMouseUp?: MouseUpCallback;
        onWheel?: WheelCallback;
        onTouchStart?: TouchStartCallback;
        onTouchMove?: TouchMoveCallback;
        onTouchEnd?: TouchEndCallback;
    };
    
    /**
     * Called when navigator is activated
     */
    activate(): void;
    
    /**
     * Called when navigator is deactivated (before switching to another navigator)
     */
    deactivate(): void;
    
    /**
     * Clean up resources
     */
    destroy(): void;
}
