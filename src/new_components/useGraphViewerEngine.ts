import { useEffect, useRef, useState, useCallback } from "react";
import { TaskListOut } from "todo-client";
import { DataSource } from "./DataSource";
import { GraphViewerEngine, EngineStateCallback } from "./GraphViewerEngine";
import { GraphViewerEngineState, INITIAL_ENGINE_STATE } from "./GraphViewerEngineState";

/**
 * useGraphViewerEngine - React hook that manages the engine lifecycle and data flow.
 *
 * PURPOSE:
 * This hook is the "glue" between React and the imperative GraphViewerEngine.
 * It handles:
 * - Creating the engine when the DOM container is ready
 * - Destroying the engine when the component unmounts
 * - Pushing prop updates to the engine via DataSource
 * - Receiving state updates from the engine via callback
 *
 * YOU PROBABLY DON'T NEED TO MODIFY THIS FILE.
 * The plumbing here is generic. Add your features in:
 * - GraphViewerEngine.ts (rendering, physics, event handling)
 * - GraphViewerEngineState.ts (what state to expose to React)
 *
 * DATA FLOW:
 * ```
 * React props (taskList)
 *     │
 *     ▼ useEffect with [taskList] dependency
 * DataSource.set()
 *     │
 *     ▼ (engine reads on next animation frame)
 * GraphViewerEngine animation loop
 *     │
 *     ▼ onStateChange callback
 * setEngineState()
 *     │
 *     ▼
 * React re-renders with new engineState
 * ```
 *
 * CRITICAL PATTERNS USED:
 *
 * 1. STABLE CALLBACK REF
 *    The engine holds a reference to onStateChange. If we passed setEngineState
 *    directly, it might change on re-renders (React doesn't guarantee stability).
 *    We use a ref to always point to the current setter, wrapped in a stable
 *    useCallback that never changes.
 *
 * 2. DATA SOURCE IN REF
 *    The DataSource instance must persist across renders. We create it once
 *    and store it in a ref.
 *
 * 3. EFFECT FOR DATA UPDATES
 *    We use useEffect with [taskList] to update the DataSource only when
 *    taskList actually changes. NOT during render, which would mark data
 *    as "new" on every unrelated re-render.
 *
 * 4. EMPTY DEPS FOR ENGINE CREATION
 *    The engine creation effect has [stableCallback] as deps, but stableCallback
 *    is stable (never changes), so this effectively runs once on mount.
 *
 * @param taskList - The task data from React props
 * @param viewportContainerRef - Ref to the DOM container where the engine renders
 * @returns The current engine state (for React UI to consume)
 */
export function useGraphViewerEngine(
    taskList: TaskListOut,
    viewportContainerRef: React.RefObject<HTMLDivElement>
): GraphViewerEngineState {
    // ─────────────────────────────────────────────────────────────────────────
    // React state that mirrors engine state
    // ─────────────────────────────────────────────────────────────────────────
    const [engineState, setEngineState] = useState<GraphViewerEngineState>(INITIAL_ENGINE_STATE);

    // ─────────────────────────────────────────────────────────────────────────
    // Stable callback pattern
    // The engine holds this callback for its lifetime. We need it to always
    // call the current setEngineState, even if React gives us a new one.
    // ─────────────────────────────────────────────────────────────────────────
    const onStateChangeRef = useRef<EngineStateCallback>(setEngineState);
    onStateChangeRef.current = setEngineState;

    const stableCallback = useCallback<EngineStateCallback>((state) => {
        onStateChangeRef.current(state);
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Data source (React → Engine)
    // Created once, persists across renders
    // ─────────────────────────────────────────────────────────────────────────
    const dataSourceRef = useRef<DataSource<TaskListOut> | null>(null);
    if (!dataSourceRef.current) {
        dataSourceRef.current = new DataSource(taskList);
    }

    const engineRef = useRef<GraphViewerEngine | null>(null);

    // ─────────────────────────────────────────────────────────────────────────
    // Push data updates (only when taskList changes)
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        dataSourceRef.current?.set(taskList);
    }, [taskList]);

    // ─────────────────────────────────────────────────────────────────────────
    // Engine lifecycle (create on mount, destroy on unmount)
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const container = viewportContainerRef.current;
        const dataSource = dataSourceRef.current;

        if (!container || !dataSource) {
            console.warn("[useGraphViewerEngine] Container or dataSource not ready");
            return;
        }

        // Create engine
        engineRef.current = new GraphViewerEngine(container, dataSource, stableCallback);

        // Cleanup on unmount
        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
        };
    }, [stableCallback]); // stableCallback is stable, so this only runs once

    return engineState;
}
