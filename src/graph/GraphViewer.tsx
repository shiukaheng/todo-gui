import { useRef, useState, useCallback } from "react";
import { TaskListOut } from "todo-client";
import { useGraphViewerEngine } from "./useGraphViewerEngine";
import { AppState, INITIAL_APP_STATE } from "./types";

interface GraphViewerProps {
    taskList: TaskListOut;
    onCursorChange?: (nodeId: string | null) => void;
}

export function GraphViewer({ taskList, onCursorChange }: GraphViewerProps) {
    // Ref to the DOM container where the engine will render
    const viewportContainerRef = useRef<HTMLDivElement>(null);

    // Internal app state (cursor, selection, etc.)
    const [appState, setAppState] = useState<AppState>(INITIAL_APP_STATE);

    // Update cursor and notify parent
    const setCursor = useCallback((nodeId: string | null) => {
        setAppState((prev) => ({ ...prev, cursor: nodeId }));
        onCursorChange?.(nodeId);
    }, [onCursorChange]);

    // Hook manages engine lifecycle and data flow
    // Returns engine state that can drive React UI
    const engineState = useGraphViewerEngine(taskList, appState, viewportContainerRef, {
        onNodeClick: setCursor,
    });

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
