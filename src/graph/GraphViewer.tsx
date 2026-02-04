import { useRef, useEffect } from "react";
import { useGraphViewerEngine } from "./useGraphViewerEngine";
import { useTodoStore } from "../stores/todoStore";
import { NodeDetailOverlay } from "./NodeDetailOverlay";

const SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function GraphViewer() {
    const navInfoText = useTodoStore((s) => s.navInfoText);
    const viewportContainerRef = useRef<HTMLDivElement>(null);
    const navigationHandle = useGraphViewerEngine(viewportContainerRef);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
            <div className="absolute w-full h-full" ref={viewportContainerRef} />
            <NodeDetailOverlay />
            {navInfoText && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white font-mono text-sm">
                    {navInfoText}
                </div>
            )}
        </div>
    );
}
