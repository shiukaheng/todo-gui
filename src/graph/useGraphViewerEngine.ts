import { useEffect, useRef, useState, useCallback } from "react";
import { TaskListOut } from "todo-client";
import { GraphViewerEngine, EngineStateCallback } from "./GraphViewerEngine";
import { GraphViewerEngineState, INITIAL_ENGINE_STATE } from "./GraphViewerEngineState";
import { AppState, INITIAL_APP_STATE } from "./types";

/**
 * useGraphViewerEngine - React hook that manages the engine lifecycle and data flow.
 *
 * Data flow:
 *   React props (taskList, appState) → engine.setGraph/setAppState() → engine animation loop → setEngineState() → React
 *
 * @param taskList - The task data from React props
 * @param appState - The app state (cursor, selection, etc.) from React props
 * @param viewportContainerRef - Ref to the DOM container where the engine renders
 * @returns The current engine state (for React UI to consume)
 */
export function useGraphViewerEngine(
    taskList: TaskListOut,
    appState: AppState = INITIAL_APP_STATE,
    viewportContainerRef: React.RefObject<HTMLDivElement>
): GraphViewerEngineState {
    const [engineState, setEngineState] = useState<GraphViewerEngineState>(INITIAL_ENGINE_STATE);

    // Stable callback pattern: engine holds this for its lifetime
    const onStateChangeRef = useRef<EngineStateCallback>(setEngineState);
    onStateChangeRef.current = setEngineState;

    const stableCallback = useCallback<EngineStateCallback>((state) => {
        onStateChangeRef.current(state);
    }, []);

    const engineRef = useRef<GraphViewerEngine | null>(null);

    // Engine lifecycle (create on mount, destroy on unmount)
    useEffect(() => {
        const container = viewportContainerRef.current;
        if (!container) {
            console.warn("[useGraphViewerEngine] Container not ready");
            return;
        }

        engineRef.current = new GraphViewerEngine(container, stableCallback);

        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
        };
    }, [stableCallback]);

    // Push data updates when taskList changes
    useEffect(() => {
        engineRef.current?.setGraph(taskList);
    }, [taskList]);

    // Push app state updates when appState changes
    useEffect(() => {
        engineRef.current?.setAppState(appState);
    }, [appState]);

    return engineState;
}
