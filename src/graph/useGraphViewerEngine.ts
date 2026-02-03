import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { TaskListOut } from "todo-client";
import { GraphViewerEngine, EngineStateCallback, GraphViewerEngineOptions } from "./GraphViewerEngine";
import { GraphViewerEngineState, INITIAL_ENGINE_STATE } from "./GraphViewerEngineState";
import { AppState } from "./types";
import { GraphNavigationHandle } from "./graphNavigation/types";

export interface UseGraphViewerEngineOptions extends GraphViewerEngineOptions {
}

export interface UseGraphViewerEngineResult {
    engineState: GraphViewerEngineState;
    navigationHandle: GraphNavigationHandle;
}

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

/**
 * useGraphViewerEngine - React hook that manages the engine lifecycle and data flow.
 *
 * Data flow:
 *   React props (taskList, appState) → engine.setGraph/setAppState() → engine animation loop → setEngineState() → React
 *
 * @param taskList - The task data from React props
 * @param appState - The app state (cursor, selection, etc.) from React props
 * @param viewportContainerRef - Ref to the DOM container where the engine renders
 * @param options - Engine options (callbacks like onNodeClick, onCursorChange)
 * @returns The current engine state and navigation handle
 */
export function useGraphViewerEngine(
    taskList: TaskListOut,
    appState: AppState,
    viewportContainerRef: React.RefObject<HTMLDivElement>,
    options?: UseGraphViewerEngineOptions
): UseGraphViewerEngineResult {
    const [engineState, setEngineState] = useState<GraphViewerEngineState>(INITIAL_ENGINE_STATE);
    const [engineReady, setEngineReady] = useState(false);

    // Stable callback pattern: engine holds this for its lifetime
    const onStateChangeRef = useRef<EngineStateCallback>(setEngineState);
    onStateChangeRef.current = setEngineState;

    const stableCallback = useCallback<EngineStateCallback>((state) => {
        onStateChangeRef.current(state);
    }, []);

    // Stable ref for options callbacks
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const stableOptions = useMemo<GraphViewerEngineOptions>(() => ({
        onNodeClick: (nodeId) => optionsRef.current?.onNodeClick?.(nodeId),
        onCursorChange: (nodeId) => optionsRef.current?.onCursorChange?.(nodeId),
    }), []);

    const engineRef = useRef<GraphViewerEngine | null>(null);

    // Engine lifecycle (create on mount, destroy on unmount)
    useEffect(() => {
        const container = viewportContainerRef.current;
        if (!container) {
            console.warn("[useGraphViewerEngine] Container not ready");
            return;
        }

        engineRef.current = new GraphViewerEngine(container, stableCallback, stableOptions);
        setEngineReady(true);

        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
            setEngineReady(false);
        };
    }, [stableCallback, stableOptions]);

    // Push data updates when taskList changes
    useEffect(() => {
        engineRef.current?.setGraph(taskList);
    }, [taskList]);

    // Push app state updates when appState changes
    useEffect(() => {
        engineRef.current?.setAppState(appState);
    }, [appState]);

    // Get navigation handle from engine (or no-op if not ready)
    const navigationHandle = engineReady && engineRef.current
        ? engineRef.current.getNavigationHandle()
        : NOOP_NAVIGATION_HANDLE;

    return { engineState, navigationHandle };
}
