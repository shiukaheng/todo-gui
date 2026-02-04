import { useEffect, useRef, useState } from "react";
import { GraphViewerEngine } from "./GraphViewerEngine";
import { GraphViewerEngineState, INITIAL_ENGINE_STATE } from "./GraphViewerEngineState";
import { GraphNavigationHandle } from "./graphNavigation/types";
import { useTodoStore } from "../stores/todoStore";

// No-op navigation handle for when engine isn't ready
const NOOP_NAVIGATION_HANDLE: GraphNavigationHandle = {
    up: () => {},
    down: () => {},
    left: () => {},
    right: () => {},
    chooseAmbiguous: () => false,
    escape: () => {},
    get state() { return { type: 'idle' as const }; },
};

export interface UseGraphViewerEngineResult {
    engineState: GraphViewerEngineState;
    navigationHandle: GraphNavigationHandle;
}

/**
 * useGraphViewerEngine - React hook that manages the engine lifecycle.
 */
export function useGraphViewerEngine(
    viewportContainerRef: React.RefObject<HTMLDivElement>
): UseGraphViewerEngineResult {
    const graphData = useTodoStore((s) => s.graphData);
    const [engineState, setEngineState] = useState<GraphViewerEngineState>(INITIAL_ENGINE_STATE);
    const engineRef = useRef<GraphViewerEngine | null>(null);

    // Create engine on mount
    useEffect(() => {
        const container = viewportContainerRef.current;
        if (!container) return;

        engineRef.current = new GraphViewerEngine(container, setEngineState);

        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
        };
    }, []);

    // Push data when graphData changes
    useEffect(() => {
        if (graphData) {
            engineRef.current?.setGraph(graphData);
        }
    }, [graphData]);

    const navigationHandle = engineRef.current?.getNavigationHandle() ?? NOOP_NAVIGATION_HANDLE;

    return { engineState, navigationHandle };
}
