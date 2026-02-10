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

            // Fly/Auto mode: Arrows for viewport movement, E/Q for zoom, WASD for topological nav
            // In auto mode, arrow keys switch to fly mode; in fly mode, it's already there
            if (navigationMode === 'fly' || navigationMode === 'auto') {
                const key = e.key.toLowerCase();
                // E/Q for zoom control - resumes autoselect
                if (['e', 'q'].includes(key)) {
                    e.preventDefault();
                    handles.fly.pauseAutoselect(false); // Resume autoselect when flying
                    switch (key) {
                        case 'e': handles.fly.zoomIn(true); break;
                        case 'q': handles.fly.zoomOut(true); break;
                    }
                    return;
                }
                // Arrow keys for viewport control - resumes autoselect
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    handles.fly.pauseAutoselect(false); // Resume autoselect when flying
                    switch (e.key) {
                        case 'ArrowUp': handles.fly.up(true); break;
                        case 'ArrowDown': handles.fly.down(true); break;
                        case 'ArrowLeft': handles.fly.left(true); break;
                        case 'ArrowRight': handles.fly.right(true); break;
                    }
                    return;
                }
                // WASD in fly mode: pause autoselect, do topological navigation
                // In auto mode, WASD navigation will trigger follow mode switch
                if (navigationMode === 'fly' && ['w', 'a', 's', 'd'].includes(key)) {
                    e.preventDefault();
                    handles.fly.pauseAutoselect(true);
                    switch (key) {
                        case 'w': handles.navigation.up(); break;
                        case 's': handles.navigation.down(); break;
                        case 'a': handles.navigation.left(); break;
                        case 'd': handles.navigation.right(); break;
                    }
                    return;
                }
                // Escape in fly mode - no special handling needed
                if (navigationMode === 'fly' && e.key === 'Escape') {
                    return;
                }
            }

            // Standard cursor navigation (non-fly modes)
            const key = e.key.toLowerCase();
            switch (key) {
                case 'w':
                    e.preventDefault();
                    handles.navigation.up();
                    break;
                case 's':
                    e.preventDefault();
                    handles.navigation.down();
                    break;
                case 'a':
                    e.preventDefault();
                    handles.navigation.left();
                    break;
                case 'd':
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

            // Fly/Auto mode: release arrow/EQ keys
            if (navigationMode === 'fly' || navigationMode === 'auto') {
                const key = e.key.toLowerCase();
                if (['e', 'q'].includes(key)) {
                    // Pause autoselect when zoom keys are released
                    handles.fly.pauseAutoselect(true);
                    switch (key) {
                        case 'e': handles.fly.zoomIn(false); break;
                        case 'q': handles.fly.zoomOut(false); break;
                    }
                }
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    // Pause autoselect when arrow keys are released
                    // This prevents fighting with WASD topology navigation
                    handles.fly.pauseAutoselect(true);
                    switch (e.key) {
                        case 'ArrowUp': handles.fly.up(false); break;
                        case 'ArrowDown': handles.fly.down(false); break;
                        case 'ArrowLeft': handles.fly.left(false); break;
                        case 'ArrowRight': handles.fly.right(false); break;
                    }
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
            <div className="absolute w-full h-full z-0" ref={viewportContainerRef} />
            <div className="absolute top-8 left-8 flex flex-col z-10 pointer-events-none">
                <div className="pointer-events-auto">
                    <ConnectionStatusPanel />
                </div>
                <div className="pointer-events-auto">
                    <NodeDetailOverlay />
                </div>
                <div className="pointer-events-auto">
                    <OutputPanel />
                </div>
            </div>
            {/* <div className="absolute top-8 right-8">
                <DeadlinePanel />
            </div> */}
            {navInfoText && !commandPlane.state.visible && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white font-mono text-sm z-10">
                    {navInfoText}
                </div>
            )}
            <CommandPlane controller={commandPlane} />
        </div>
    );
}
