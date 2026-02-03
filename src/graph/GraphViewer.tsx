import { useRef, useState, useCallback, useEffect } from "react";
import { useGraphViewerEngine } from "./useGraphViewerEngine";
import { AppState, INITIAL_APP_STATE } from "./types";
import { useTodo } from "./TodoContext";

const SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function GraphViewer() {
    const { graphData: taskList } = useTodo();

    // Ref to the DOM container where the engine will render
    const viewportContainerRef = useRef<HTMLDivElement>(null);

    // Internal app state (cursor, selection, etc.)
    const [appState, setAppState] = useState<AppState>(INITIAL_APP_STATE);

    // Update cursor
    const setCursor = useCallback((nodeId: string | null) => {
        setAppState((prev) => ({ ...prev, cursor: nodeId }));
    }, []);

    // Hook manages engine lifecycle, navigation, and data flow
    // Note: taskList is guaranteed non-null because App guards before rendering GraphViewer
    const { engineState, navigationHandle } = useGraphViewerEngine(taskList!, appState, viewportContainerRef, {
        onNodeClick: setCursor,
        onCursorChange: setCursor,
    });

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
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
                    if (SELECTORS.includes(e.key)) {
                        navigationHandle.chooseAmbiguous(e.key);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigationHandle]);

    return (
        <div className="absolute w-full h-full bg-black">
            {/* Engine renders into this container (canvas, SVG, or DOM nodes) */}
            <div className="absolute w-full h-full" ref={viewportContainerRef} />
            {/* Navigation info text */}
            {engineState.navInfoText && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white font-mono text-sm">
                    {engineState.navInfoText}
                </div>
            )}
        </div>
    );
}
