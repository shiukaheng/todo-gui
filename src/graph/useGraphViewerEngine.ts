import { useEffect, useRef, useState, useCallback } from "react";
import { TaskListOut } from "todo-client";
import { GraphViewerEngine, EngineStateCallback, GraphViewerEngineOptions } from "./GraphViewerEngine";
import { GraphViewerEngineState, INITIAL_ENGINE_STATE } from "./GraphViewerEngineState";
import { AppState } from "./types";
import { NavState, IDLE_STATE, GraphNavigationHandle } from "./graphNavigation/types";
import { useGraphNavigationHandle } from "./graphNavigation/useGraphNavigationHandle";

const SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export interface UseGraphViewerEngineOptions extends GraphViewerEngineOptions {
    onCursorChange?: (nodeId: string | null) => void;
}

export interface UseGraphViewerEngineResult {
    engineState: GraphViewerEngineState;
    navigationHandle: GraphNavigationHandle;
}

/**
 * useGraphViewerEngine - React hook that manages the engine lifecycle and data flow.
 *
 * Data flow:
 *   React props (taskList, appState) → engine.setGraph/setAppState() → engine animation loop → setEngineState() → React
 *
 * @param taskList - The task data from React props
 * @param appState - The app state (cursor, selection, etc.) from React props
 * @param viewportContainerRef - Ref to the DOM container where the engine renders
 * @param options - Engine options (callbacks like onNodeClick)
 * @returns The current engine state and navigation handle
 */
export function useGraphViewerEngine(
    taskList: TaskListOut,
    appState: AppState,
    viewportContainerRef: React.RefObject<HTMLDivElement>,
    options?: UseGraphViewerEngineOptions
): UseGraphViewerEngineResult {
    const [engineState, setEngineState] = useState<GraphViewerEngineState>(INITIAL_ENGINE_STATE);
    const [navState, setNavState] = useState<NavState>(IDLE_STATE);

    // Stable callback pattern: engine holds this for its lifetime
    const onStateChangeRef = useRef<EngineStateCallback>(setEngineState);
    onStateChangeRef.current = setEngineState;

    const stableCallback = useCallback<EngineStateCallback>((state) => {
        onStateChangeRef.current(state);
    }, []);

    // Stable ref for options callbacks
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const stableOptions = useRef<UseGraphViewerEngineOptions>({
        onNodeClick: (nodeId) => optionsRef.current?.onNodeClick?.(nodeId),
    }).current;

    const engineRef = useRef<GraphViewerEngine | null>(null);

    // Engine lifecycle (create on mount, destroy on unmount)
    useEffect(() => {
        const container = viewportContainerRef.current;
        if (!container) {
            console.warn("[useGraphViewerEngine] Container not ready");
            return;
        }

        engineRef.current = new GraphViewerEngine(container, stableCallback, stableOptions);

        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
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

    // Push nav state updates when navState changes
    useEffect(() => {
        engineRef.current?.setNavState(navState, SELECTORS);
    }, [navState]);

    // Cursor change handler for navigation
    const handleCursorChange = useCallback((nodeId: string | null) => {
        optionsRef.current?.onCursorChange?.(nodeId);
    }, []);

    // Navigation handle (uses cursorNeighbors from engine state)
    const navigationHandle = useGraphNavigationHandle({
        cursorNeighbors: engineState.cursorNeighbors,
        navDirectionMapping: appState.navDirectionMapping,
        selectors: SELECTORS,
        onCursorChange: handleCursorChange,
        onNavStateChange: setNavState,
    });

    return { engineState, navigationHandle };
}
