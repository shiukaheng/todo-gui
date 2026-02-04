import { useRef, useEffect } from "react";
import { useGraphViewerEngine } from "./useGraphViewerEngine";
import { useTodoStore } from "../stores/todoStore";
import { NodeDetailPanel } from "./NodeDetailPanel";

const SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function GraphViewer() {
    const navInfoText = useTodoStore((s) => s.navInfoText);
    const cursor = useTodoStore((s) => s.cursor);
    const graphData = useTodoStore((s) => s.graphData);
    const api = useTodoStore((s) => s.api);
    const viewportContainerRef = useRef<HTMLDivElement>(null);
    const navigationHandle = useGraphViewerEngine(viewportContainerRef);

    // Get the current task if cursor is set
    const currentTask = cursor && graphData?.tasks[cursor] ? graphData.tasks[cursor] : null;

    // Toggle completion with space key
    const toggleCompletion = async () => {
        if (!currentTask || !api) return;
        if (currentTask.inferred) return; // Can't toggle inferred nodes

        try {
            await api.setTaskApiTasksTaskIdPatch({
                taskId: currentTask.id,
                taskUpdate: { completed: !currentTask.completed },
            });
        } catch (err) {
            console.error("Failed to toggle completion:", err);
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle if focus is in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

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
                case ' ':
                    e.preventDefault();
                    toggleCompletion();
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
    }, [navigationHandle, currentTask, api]);

    return (
        <div className="absolute w-full h-full bg-black">
            {/* Engine renders into this container (canvas, SVG, or DOM nodes) */}
            <div className="absolute w-full h-full" ref={viewportContainerRef} />

            {/* Node detail panel */}
            {currentTask && <NodeDetailPanel task={currentTask} />}

            {/* Navigation info text */}
            {navInfoText && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white font-mono text-sm">
                    {navInfoText}
                </div>
            )}
        </div>
    );
}
