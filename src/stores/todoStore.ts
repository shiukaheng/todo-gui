import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    type AppState,
    type ViewListOut,
    DefaultApi,
    Configuration,
    subscribeToDisplay,
} from 'todo-client';
import { OptimisticTodoClient, type TodoApi } from '../client/OptimisticTodoClient';
import { viewTrace } from '../utils/viewTrace';
import { type Filter, EMPTY_FILTER } from './filterTypes';

/** Navigation mode for the graph viewer */
export type NavigationMode = 'auto' | 'manual' | 'follow' | 'fly';

/** Simulation mode for the graph layout */
export type SimulationMode = 'cola' | 'force';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface TodoStore {
    // ── Server-authoritative state (global graph) ────────────────────
    // Pushed via SSE; never persisted locally.
    graphData: AppState | null;

    // ── Server-authoritative state (display / views) ─────────────────
    // Pushed via display SSE; never persisted locally.
    viewsData: ViewListOut | null;

    // ── Local persisted state (survives refresh via localStorage) ─────
    // See `partialize` at the bottom for what gets persisted.
    filter: Filter;
    localPositions: Record<string, { x: number; y: number }> | null;

    // ── Transient UI state (lost on refresh) ─────────────────────────
    cursor: string | null;
    pendingCursors: string[];
    navInfoText: string | null;
    navigationMode: NavigationMode;
    simulationMode: SimulationMode;
    commandPlaneVisible: boolean;
    savePositionsCallback: ((viewId: string) => void) | null;
    loadPositionsCallback: ((viewId: string) => void) | null;
    saveLocalPositionsCallback: (() => void) | null;

    // ── Connection / runtime (lost on refresh) ───────────────────────
    connectionStatus: ConnectionStatus;
    baseUrl: string | null;
    lastError: string | null;
    lastDataReceived: number | null;
    api: TodoApi | null;
    unsubscribe: (() => void) | null;
    displayUnsubscribe: (() => void) | null;

    // ── Actions ──────────────────────────────────────────────────────
    setCursor: (nodeId: string | null) => void;
    queueCursor: (nodeId: string) => void;
    setNavInfoText: (text: string | null) => void;
    setNavigationMode: (mode: NavigationMode) => void;
    setSimulationMode: (mode: SimulationMode) => void;
    showCommandPlane: () => void;
    hideCommandPlane: () => void;
    setFilter: (filter: Filter) => void;
    setLocalPositions: (positions: Record<string, { x: number; y: number }>) => void;
    subscribeDisplay: (baseUrl: string) => () => void;
    disconnectDisplay: () => void;
    subscribe: (baseUrl: string) => () => void;
    disconnect: () => void;
}

/**
 * Derive a Filter from a ViewOut.
 * Used by loadview to extract filter fields from a server-stored view.
 */
export function deriveFilterFromView(viewsData: ViewListOut | null, viewId: string): Filter {
    console.log(viewsData, viewId)
    if (!viewsData) return EMPTY_FILTER;
    const viewData = viewsData.views?.[viewId];
    if (!viewData) return EMPTY_FILTER;
    return {
        includeRecursive: viewData.includeRecursive?.length ? viewData.includeRecursive : null,
        excludeRecursive: viewData.excludeRecursive?.length ? viewData.excludeRecursive : null,
        hideCompletedFor: viewData.hideCompletedFor ?? null,
    };
}

/** Resolve pending cursors against graphData. Walk from most recent to oldest;
 *  first node found in tasks → set cursor, clear the queue. */
function resolvePendingCursors(
    graphData: AppState | null,
    get: () => TodoStore,
    set: (partial: Partial<TodoStore>) => void,
) {
    const pending = get().pendingCursors;
    if (pending.length === 0 || !graphData?.tasks) return;
    for (let i = pending.length - 1; i >= 0; i--) {
        if (graphData.tasks[pending[i]]) {
            set({ cursor: pending[i], pendingCursors: [] });
            return;
        }
    }
}

export const useTodoStore = create<TodoStore>()(persist((set, get) => ({
    // ── Server-authoritative ─────────────────────────────────────────
    graphData: null,
    viewsData: null,

    // ── Local persisted ──────────────────────────────────────────────
    filter: EMPTY_FILTER,
    localPositions: null,

    // ── Transient UI ─────────────────────────────────────────────────
    cursor: null,
    pendingCursors: [],
    navInfoText: null,
    navigationMode: 'auto' as NavigationMode,
    simulationMode: 'cola' as SimulationMode,
    commandPlaneVisible: false,
    savePositionsCallback: null,
    loadPositionsCallback: null,
    saveLocalPositionsCallback: null,

    // ── Connection / runtime ─────────────────────────────────────────
    connectionStatus: 'disconnected' as ConnectionStatus,
    baseUrl: null,
    lastError: null,
    lastDataReceived: null,
    api: null,
    unsubscribe: null,
    displayUnsubscribe: null,

    setCursor: (nodeId) => set({ cursor: nodeId }),
    queueCursor: (nodeId) => {
        set({ pendingCursors: [...get().pendingCursors, nodeId] });
        resolvePendingCursors(get().graphData, get, set);
    },
    setNavInfoText: (text) => set({ navInfoText: text }),
    setNavigationMode: (mode) => set({ navigationMode: mode }),
    setSimulationMode: (mode) => set({ simulationMode: mode }),
    showCommandPlane: () => set({ commandPlaneVisible: true }),
    hideCommandPlane: () => set({ commandPlaneVisible: false }),
    setFilter: (filter) => set({ filter }),
    setLocalPositions: (positions) => set((state) => ({
        localPositions: { ...state.localPositions, ...positions },
    })),

    disconnectDisplay: () => {
        get().displayUnsubscribe?.();
        set({ displayUnsubscribe: null, viewsData: null });
    },

    subscribeDisplay: (baseUrl: string) => {
        get().displayUnsubscribe?.();
        viewTrace('Store', 'subscribeDisplay:start', { baseUrl });

        const unsubscribe = subscribeToDisplay(
            (data) => {
                viewTrace('Store', 'displaySSE:update', {
                    viewCount: Object.keys(data.views || {}).length,
                });
                set({ viewsData: data });
            },
            {
                baseUrl,
                onError: (err) => {
                    console.error('Display SSE connection error:', err);
                },
            }
        );

        set({ displayUnsubscribe: unsubscribe });

        return () => {
            get().displayUnsubscribe?.();
            set({ displayUnsubscribe: null });
        };
    },

    disconnect: () => {
        get().unsubscribe?.();
        get().displayUnsubscribe?.();
        set({
            unsubscribe: null,
            displayUnsubscribe: null,
            api: null,
            connectionStatus: 'disconnected',
            graphData: null,
            viewsData: null,
        });
    },

    subscribe: (baseUrl: string) => {
        // Clean up existing subscription
        get().unsubscribe?.();
        viewTrace('Store', 'subscribe:start', { baseUrl });

        set({
            connectionStatus: 'connecting',
            baseUrl,
            lastError: null,
        });

        const rawApi = new DefaultApi(new Configuration({ basePath: baseUrl }));
        const client = new OptimisticTodoClient(rawApi);
        // const client = rawApi; // TODO toggle optimistic client

        const unsubscribe = client.subscribeToState(
            (data) => {
                viewTrace('Store', 'stateSSE:update', {
                    taskCount: Object.keys(data.tasks || {}).length,
                    depCount: Object.keys(data.dependencies || {}).length,
                });
                set({
                    graphData: data,
                    connectionStatus: 'connected',
                    lastDataReceived: Date.now(),
                    lastError: null,
                });
                resolvePendingCursors(data, get, set);
            },
            {
                baseUrl,
                onError: (err) => {
                    console.error('SSE connection error:', err);
                    let errorMessage = 'Connection failed';
                    if (err instanceof Error) {
                        errorMessage = err.message;
                    } else if (err instanceof Event) {
                        errorMessage = 'Unable to connect to server';
                    }
                    set({
                        connectionStatus: 'error',
                        lastError: errorMessage,
                    });
                },
            }
        );

        // Also subscribe to display layer
        const displayUnsubscribe = client.subscribeToDisplay(
            (data) => {
                viewTrace('Store', 'displaySSE:update', {
                    viewCount: Object.keys(data.views || {}).length,
                });
                set({ viewsData: data });
            },
            {
                baseUrl,
                onError: (err) => {
                    console.error('Display SSE connection error:', err);
                },
            }
        );

        set({ api: client, unsubscribe, displayUnsubscribe });

        return () => {
            get().unsubscribe?.();
            get().displayUnsubscribe?.();
            set({ unsubscribe: null, displayUnsubscribe: null, connectionStatus: 'disconnected' });
        };
    },
}), {
    name: 'todo-store',
    partialize: (state) => ({ filter: state.filter, localPositions: state.localPositions }),
}));
