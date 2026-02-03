import { useEffect, useRef, useState } from "react";
import { TaskListOut } from "todo-client";
import { GraphViewerEngine } from "./GraphViewerEngine";
import { GraphViewerEngineState, INITIAL_ENGINE_STATE } from "./GraphViewerEngineState";
import { AppState } from "./types";
import { GraphNavigationHandle } from "./graphNavigation/types";

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
    taskList: TaskListOut,
    appState: AppState,
    viewportContainerRef: React.RefObject<HTMLDivElement>,
    setCursor: (nodeId: string) => void
): UseGraphViewerEngineResult {
    const [engineState, setEngineState] = useState<GraphViewerEngineState>(INITIAL_ENGINE_STATE);
    const engineRef = useRef<GraphViewerEngine | null>(null);
    const setCursorRef = useRef(setCursor);
    setCursorRef.current = setCursor;

    // Create engine on mount
    useEffect(() => {
        const container = viewportContainerRef.current;
        if (!container) return;

        engineRef.current = new GraphViewerEngine(
            container,
            setEngineState,
            (nodeId) => setCursorRef.current(nodeId)
        );

        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
        };
    }, []);

    // Push data when taskList changes
    useEffect(() => {
        engineRef.current?.setGraph(taskList);
    }, [taskList]);

    // Push app state when it changes
    useEffect(() => {
        engineRef.current?.setAppState(appState);
    }, [appState]);

    const navigationHandle = engineRef.current?.getNavigationHandle() ?? NOOP_NAVIGATION_HANDLE;

    return { engineState, navigationHandle };
}
