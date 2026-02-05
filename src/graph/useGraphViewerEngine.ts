import { useEffect, useRef } from "react";
import { GraphViewerEngine, AbstractGraphViewerEngine } from "./GraphViewerEngine";
import { GraphNavigationHandle } from "./graphNavigation/types";
import { FlyNavigationHandle } from "./navigation/types";
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

const NOOP_FLY_HANDLE: FlyNavigationHandle = {
    up: (_pressed: boolean) => {},
    down: (_pressed: boolean) => {},
    left: (_pressed: boolean) => {},
    right: (_pressed: boolean) => {},
    zoomIn: (_pressed: boolean) => {},
    zoomOut: (_pressed: boolean) => {},
};

export interface GraphViewerHandles {
    navigation: GraphNavigationHandle;
    fly: FlyNavigationHandle;
}

/**
 * useGraphViewerEngine - React hook that manages the engine lifecycle.
 */
export function useGraphViewerEngine(
    viewportContainerRef: React.RefObject<HTMLDivElement>
): GraphViewerHandles {
    const graphData = useTodoStore((s) => s.graphData);
    const engineRef = useRef<AbstractGraphViewerEngine | null>(null);

    // Create engine on mount
    useEffect(() => {
        const container = viewportContainerRef.current;
        if (!container) return;

        engineRef.current = new GraphViewerEngine(
            container,
            () => useTodoStore.getState().cursor,
            (nodeId) => useTodoStore.getState().setCursor(nodeId),
            (text) => useTodoStore.getState().setNavInfoText(text)
        );

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

    return {
        navigation: engineRef.current?.getNavigationHandle() ?? NOOP_NAVIGATION_HANDLE,
        fly: engineRef.current?.getFlyNavigationHandle() ?? NOOP_FLY_HANDLE,
    };
}
