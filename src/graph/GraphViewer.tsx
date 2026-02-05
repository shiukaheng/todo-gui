import { useRef, useEffect } from "react";
import { useGraphViewerEngine } from "./useGraphViewerEngine";
import { useTodoStore } from "../stores/todoStore";
import { NodeDetailOverlay } from "./NodeDetailOverlay";
import { CommandPlane, OutputPanel, useCommandPlane, registerBuiltinCommands } from "../commander";
import { ConnectionStatusPanel } from "../components/ConnectionStatusPanel";
import { DeadlinePanel } from "../components/DeadlinePanel";

// Register commands once on module load
registerBuiltinCommands();

const SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function GraphViewer() {
    const navInfoText = useTodoStore((s) => s.navInfoText);
    const navigationMode = useTodoStore((s) => s.navigationMode);
    const viewportContainerRef = useRef<HTMLDivElement>(null);
    const handles = useGraphViewerEngine(viewportContainerRef);
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

            // Fly mode: WASD for movement, E/Q for zoom
            if (navigationMode === 'fly') {
                const key = e.key.toLowerCase();
                if (['w', 'a', 's', 'd', 'e', 'q'].includes(key)) {
                    e.preventDefault();
                    switch (key) {
                        case 'w': handles.fly.up(true); break;
                        case 's': handles.fly.down(true); break;
                        case 'a': handles.fly.left(true); break;
                        case 'd': handles.fly.right(true); break;
                        case 'e': handles.fly.zoomIn(true); break;
                        case 'q': handles.fly.zoomOut(true); break;
                    }
                    return;
                }
                // Escape in fly mode - no special handling needed
                if (e.key === 'Escape') {
                    return;
                }
            }

            // Standard cursor navigation (non-fly modes)
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    handles.navigation.up();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    handles.navigation.down();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handles.navigation.left();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handles.navigation.right();
                    break;
                case 'Escape':
                    if (handles.navigation.state.type !== 'idle') {
                        handles.navigation.escape();
                    } else {
                        useTodoStore.getState().setCursor(null);
                    }
                    break;
                default:
                    if (SELECTORS.includes(e.key)) {
                        handles.navigation.chooseAmbiguous(e.key);
                    }
                    break;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            // Skip if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (commandPlane.state.visible) return;

            // Fly mode: release WASD/EQ keys
            if (navigationMode === 'fly') {
                const key = e.key.toLowerCase();
                switch (key) {
                    case 'w': handles.fly.up(false); break;
                    case 's': handles.fly.down(false); break;
                    case 'a': handles.fly.left(false); break;
                    case 'd': handles.fly.right(false); break;
                    case 'e': handles.fly.zoomIn(false); break;
                    case 'q': handles.fly.zoomOut(false); break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handles, commandPlane, navigationMode]);

    return (
        <div className="absolute w-full h-full bg-black">
            <div className="absolute w-full h-full" ref={viewportContainerRef} />
            <div className="absolute top-8 left-8 flex flex-col">
                <ConnectionStatusPanel />
                <NodeDetailOverlay />
                <OutputPanel />
            </div>
            {/* <div className="absolute top-8 right-8">
                <DeadlinePanel />
            </div> */}
            {navInfoText && !commandPlane.state.visible && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white font-mono text-sm">
                    {navInfoText}
                </div>
            )}
            <CommandPlane controller={commandPlane} />
        </div>
    );
}
