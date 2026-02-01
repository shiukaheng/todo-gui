import { useRef } from "react";
import { TaskListOut } from "todo-client";
import { useGraphViewerEngine } from "./useGraphViewerEngine";

/**
 * NewGraphViewer - React component that hosts the graph visualization.
 *
 * PURPOSE:
 * This is the React "shell" that:
 * - Provides a DOM container for the engine to render into
 * - Passes data (taskList) to the engine via the hook
 * - Renders React UI elements that respond to engine state
 *
 * WHAT YOU CAN DO HERE:
 *
 * 1. RENDER REACT OVERLAYS
 *    Use engineState to conditionally render UI on top of the graph:
 *    ```tsx
 *    {engineState.selectedNodeId && (
 *        <NodeInfoPanel nodeId={engineState.selectedNodeId} />
 *    )}
 *    ```
 *
 * 2. PASS CALLBACKS TO ENGINE (if needed in future)
 *    You could extend the hook to accept callbacks:
 *    ```tsx
 *    const engineState = useGraphViewerEngine(taskList, viewportContainerRef, {
 *        onNodeClick: (nodeId) => navigate(`/task/${nodeId}`),
 *    });
 *    ```
 *
 * 3. ADD REACT CONTROLS
 *    Buttons, sliders, etc. that call engine methods:
 *    ```tsx
 *    <button onClick={() => engineRef.current?.resetZoom()}>Reset Zoom</button>
 *    ```
 *    (Would need to expose engineRef from the hook)
 *
 * WHAT HAPPENS UNDER THE HOOD:
 * ```
 * NewGraphViewer renders
 *     │
 *     ├─► viewportContainerRef attaches to the div
 *     │
 *     ├─► useGraphViewerEngine hook:
 *     │       - Creates DataSource with initial taskList
 *     │       - Creates GraphViewerEngine (starts animation loop)
 *     │       - Returns engineState
 *     │
 *     ▼
 * [Engine runs independently in animation loop]
 *     │
 *     ├─► When taskList prop changes → DataSource.set() → engine sees isNew=true
 *     │
 *     ├─► When engine state changes → onStateChange() → React re-renders
 *     │
 *     ▼
 * Component unmounts → engine.destroy() → animation loop stops
 * ```
 */

interface NewGraphViewerProps {
    taskList: TaskListOut;
}

export function NewGraphViewer({ taskList }: NewGraphViewerProps) {
    // Ref to the DOM container where the engine will render
    const viewportContainerRef = useRef<HTMLDivElement>(null);

    // Hook manages engine lifecycle and data flow
    // Returns engine state that can drive React UI
    const engineState = useGraphViewerEngine(taskList, viewportContainerRef);

    return (
        <div className="absolute w-full h-full bg-black">
            {/* Engine renders into this container (canvas, SVG, or DOM nodes) */}
            <div className="absolute w-full h-full" ref={viewportContainerRef} />

            {/* React UI driven by engine state */}
            <div className="absolute top-2 left-2 text-white text-xs font-mono opacity-50">
                Simulating: {engineState.isSimulating ? "yes" : "no"}
            </div>

            {/* TODO: Add more React UI as needed */}
            {/* {engineState.selectedNodeId && (
                <NodeInfoPanel nodeId={engineState.selectedNodeId} />
            )} */}
        </div>
    );
}
