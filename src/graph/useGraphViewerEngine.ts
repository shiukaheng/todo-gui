import { useEffect, useRef, useMemo } from "react";
import { GraphViewerEngine, AbstractGraphViewerEngine } from "./GraphViewerEngine";
import { GraphNavigationHandle } from "./graphNavigation/types";
import { FlyNavigationHandle } from "./navigation/types";
import { useTodoStore } from "../stores/todoStore";

export interface GraphViewerHandles {
    navigation: GraphNavigationHandle;
    fly: FlyNavigationHandle;
}

/**
 * useGraphViewerEngine - React hook that manages the engine lifecycle.
 *
 * Returns stable handle objects that delegate to the current engine.
 * This ensures handles work correctly across HMR and before engine initialization.
 */
export function useGraphViewerEngine(
    viewportContainerRef: React.RefObject<HTMLDivElement>
): GraphViewerHandles {
    const graphData = useTodoStore((s) => s.graphData);
    const engineRef = useRef<AbstractGraphViewerEngine | null>(null);

    // Create stable delegating handles that always look up current engine
    const handles = useMemo<GraphViewerHandles>(() => ({
        navigation: {
            up: () => engineRef.current?.getNavigationHandle().up(),
            down: () => engineRef.current?.getNavigationHandle().down(),
            left: () => engineRef.current?.getNavigationHandle().left(),
            right: () => engineRef.current?.getNavigationHandle().right(),
            chooseAmbiguous: (key: string) => engineRef.current?.getNavigationHandle().chooseAmbiguous(key) ?? false,
            escape: () => engineRef.current?.getNavigationHandle().escape(),
            get state() { return engineRef.current?.getNavigationHandle().state ?? { type: 'idle' as const }; },
        },
        fly: {
            up: (pressed: boolean) => engineRef.current?.getFlyNavigationHandle()?.up(pressed),
            down: (pressed: boolean) => engineRef.current?.getFlyNavigationHandle()?.down(pressed),
            left: (pressed: boolean) => engineRef.current?.getFlyNavigationHandle()?.left(pressed),
            right: (pressed: boolean) => engineRef.current?.getFlyNavigationHandle()?.right(pressed),
            zoomIn: (pressed: boolean) => engineRef.current?.getFlyNavigationHandle()?.zoomIn(pressed),
            zoomOut: (pressed: boolean) => engineRef.current?.getFlyNavigationHandle()?.zoomOut(pressed),
            pauseAutoselect: (paused: boolean) => engineRef.current?.getFlyNavigationHandle()?.pauseAutoselect(paused),
        },
    }), []);

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
            engineRef.current?.updateState(graphData);
        }
    }, [graphData]);

    return handles;
}
