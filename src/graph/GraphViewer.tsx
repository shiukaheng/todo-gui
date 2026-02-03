import { useRef, useState, useCallback, useImperativeHandle, useEffect, RefObject } from "react";
import { TaskListOut } from "todo-client";
import { useGraphViewerEngine } from "./useGraphViewerEngine";
import { AppState, INITIAL_APP_STATE, NavDirectionMapping, DEFAULT_NAV_MAPPING } from "./types";
import { CursorNeighbors, EMPTY_CURSOR_NEIGHBORS } from "./GraphViewerEngineState";
import { NavState, IDLE_STATE, GraphNavigationHandle } from "./graphNavigation/types";
import { useGraphNavigationHandle } from "./graphNavigation/useGraphNavigationHandle";

const DEFAULT_SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

interface GraphViewerProps {
    taskList: TaskListOut;
    onCursorChange?: (nodeId: string | null) => void;
    handleRef?: RefObject<GraphNavigationHandle | null>;
    ambiguousSelectors?: string[];
    navDirectionMapping?: NavDirectionMapping;
}

export function GraphViewer({
    taskList,
    onCursorChange,
    handleRef,
    ambiguousSelectors = DEFAULT_SELECTORS,
    navDirectionMapping = DEFAULT_NAV_MAPPING,
}: GraphViewerProps) {
    // Ref to the DOM container where the engine will render
    const viewportContainerRef = useRef<HTMLDivElement>(null);

    // Internal app state (cursor, selection, etc.)
    const [appState, setAppState] = useState<AppState>({
        ...INITIAL_APP_STATE,
        navDirectionMapping,
    });

    // Navigation state for the state machine
    const [navState, setNavState] = useState<NavState>(IDLE_STATE);

    // Cursor neighbors (updated by engine callback)
    const [cursorNeighbors, setCursorNeighbors] = useState<CursorNeighbors>(EMPTY_CURSOR_NEIGHBORS);

    // Update cursor and notify parent
    const setCursor = useCallback((nodeId: string | null) => {
        setAppState((prev) => ({ ...prev, cursor: nodeId }));
        onCursorChange?.(nodeId);
    }, [onCursorChange]);

    // Create navigation handle
    const navigationHandle = useGraphNavigationHandle({
        cursorNeighbors,
        navDirectionMapping: appState.navDirectionMapping,
        selectors: ambiguousSelectors,
        onCursorChange: setCursor,
        onNavStateChange: setNavState,
    });

    // Expose handle via ref
    useImperativeHandle(handleRef, () => navigationHandle, [navigationHandle]);

    // Keyboard navigation (for testing)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Arrow keys for navigation
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    navigationHandle.up();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    navigationHandle.down();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    navigationHandle.left();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    navigationHandle.right();
                    break;
                case 'Escape':
                    navigationHandle.escape();
                    break;
                default:
                    // Number keys for disambiguation
                    if (ambiguousSelectors.includes(e.key)) {
                        navigationHandle.chooseAmbiguous(e.key);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigationHandle, ambiguousSelectors]);

    // Hook manages engine lifecycle and data flow
    // Returns engine state that can drive React UI
    const engineState = useGraphViewerEngine(taskList, appState, viewportContainerRef, {
        onNodeClick: setCursor,
        onCursorNeighborsChange: setCursorNeighbors,
        navState,
        selectors: ambiguousSelectors,
    });

    return (
        <div className="absolute w-full h-full bg-black">
            {/* Engine renders into this container (canvas, SVG, or DOM nodes) */}
            <div className="absolute w-full h-full" ref={viewportContainerRef} />

            {/* React UI driven by engine state */}
            <div className="absolute top-2 left-2 text-white text-xs font-mono opacity-50">
                Simulating: {engineState.isSimulating ? "yes" : "no"}
            </div>

            {/* Navigation info text */}
            {engineState.navInfoText && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded font-mono text-sm">
                    {engineState.navInfoText}
                </div>
            )}
        </div>
    );
}
