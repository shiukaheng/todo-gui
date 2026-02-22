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
    displayData: ViewListOut | null;

    // ── Local persisted state (survives refresh via localStorage) ─────
    // See `partialize` at the bottom for what gets persisted.
    activeView: string;

    // ── Transient UI state (lost on refresh) ─────────────────────────
    cursor: string | null;
    pendingCursors: string[];
    navInfoText: string | null;
    navigationMode: NavigationMode;
    simulationMode: SimulationMode;
    commandPlaneVisible: boolean;
    savePositionsCallback: (() => void) | null;

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
    setActiveView: (viewId: string) => void;
    subscribeDisplay: (baseUrl: string) => () => void;
    disconnectDisplay: () => void;
    subscribe: (baseUrl: string) => () => void;
    disconnect: () => void;
}

/**
 * Derive filter/hide arrays from displayData for a given view.
 * Exported for use by the engine.
 */
export function deriveViewFilters(displayData: ViewListOut | null, viewId: string): {
    filterNodeIds: string[] | null;
    hideNodeIds: string[] | null;
} {
    if (!displayData) {
        return { filterNodeIds: null, hideNodeIds: null };
    }
    const viewData = displayData.views?.[viewId];
    if (!viewData) {
        return { filterNodeIds: null, hideNodeIds: null };
    }
    return {
        filterNodeIds: viewData.whitelist?.length ? viewData.whitelist : null,
        hideNodeIds: viewData.blacklist?.length ? viewData.blacklist : null,
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
    displayData: null,

    // ── Local persisted ──────────────────────────────────────────────
    activeView: 'default',

    // ── Transient UI ─────────────────────────────────────────────────
    cursor: null,
    pendingCursors: [],
    navInfoText: null,
    navigationMode: 'auto' as NavigationMode,
    simulationMode: 'cola' as SimulationMode,
    commandPlaneVisible: false,
    savePositionsCallback: null,

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
    setActiveView: (viewId) => {
        const { activeView } = get();
        viewTrace('Store', 'setActiveView', {
            fromViewId: activeView,
            toViewId: viewId,
        });
        set({ activeView: viewId });
    },

    disconnectDisplay: () => {
        get().displayUnsubscribe?.();
        set({ displayUnsubscribe: null, displayData: null });
    },

    subscribeDisplay: (baseUrl: string) => {
        get().displayUnsubscribe?.();
        viewTrace('Store', 'subscribeDisplay:start', { baseUrl });

        const unsubscribe = subscribeToDisplay(
            (data) => {
                const { activeView } = get();
                viewTrace('Store', 'displaySSE:update', {
                    activeView,
                    viewCount: Object.keys(data.views || {}).length,
                });
                set({ displayData: data });
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
            displayData: null,
            activeView: 'default',
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
                const { activeView } = get();
                viewTrace('Store', 'displaySSE:update', {
                    activeView,
                    viewCount: Object.keys(data.views || {}).length,
                });
                set({ displayData: data });
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
    partialize: (state) => ({ activeView: state.activeView }),
}));
