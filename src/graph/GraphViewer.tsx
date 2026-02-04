import { useRef, useEffect } from "react";
import { useGraphViewerEngine } from "./useGraphViewerEngine";
import { useTodoStore } from "../stores/todoStore";
import { NodeDetailOverlay } from "./NodeDetailOverlay";
import { CommandPlane, OutputPanel, useCommandPlane, registerBuiltinCommands } from "../commander";
import { ConnectionStatusPanel } from "../components/ConnectionStatusPanel";

// Register commands once on module load
registerBuiltinCommands();

const SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function GraphViewer() {
    const navInfoText = useTodoStore((s) => s.navInfoText);
    const viewportContainerRef = useRef<HTMLDivElement>(null);
    const navigationHandle = useGraphViewerEngine(viewportContainerRef);
    const commandPlane = useCommandPlane();

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if typing in an input (command plane handles its own input)
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            // Enter opens command plane
            if (e.key === 'Enter' && !commandPlane.state.visible) {
                e.preventDefault();
                commandPlane.show();
                return;
            }

            // When command plane is visible, don't process navigation keys
            if (commandPlane.state.visible) {
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
                    if (navigationHandle.state.type !== 'idle') {
                        navigationHandle.escape();
                    } else {
                        useTodoStore.getState().setCursor(null);
                    }
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
    }, [navigationHandle, commandPlane]);

    return (
        <div className="absolute w-full h-full bg-black">
            <div className="absolute w-full h-full" ref={viewportContainerRef} />
            <div className="absolute top-8 left-8 flex flex-col">
                <ConnectionStatusPanel />
                <NodeDetailOverlay />
                <OutputPanel />
            </div>
            {navInfoText && !commandPlane.state.visible && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white font-mono text-sm">
                    {navInfoText}
                </div>
            )}
            <CommandPlane controller={commandPlane} />
        </div>
    );
}
