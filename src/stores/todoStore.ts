import { create } from 'zustand';
import {
    type AppState,
    type ViewListOut,
    DefaultApi,
    Configuration,
    subscribeToState,
    subscribeToDisplay,
} from 'todo-client';
import { viewTrace } from '../utils/viewTrace';

/** Navigation mode for the graph viewer */
export type NavigationMode = 'auto' | 'manual' | 'follow' | 'fly';

/** Simulation mode for the graph layout */
export type SimulationMode = 'cola' | 'force';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface TodoStore {
    // State
    graphData: AppState | null;
    cursor: string | null;
    navInfoText: string | null;
    navigationMode: NavigationMode;
    simulationMode: SimulationMode;

    // Connection state
    connectionStatus: ConnectionStatus;
    baseUrl: string | null;
    lastError: string | null;
    lastDataReceived: number | null;

    // API client (set after subscribe)
    api: DefaultApi | null;
    unsubscribe: (() => void) | null;

    // Command plane state
    commandPlaneVisible: boolean;

    // Client-side filter state
    filterNodeIds: string[] | null;
    blacklistNodeIds: string[] | null;

    // Display layer state
    displayData: ViewListOut | null;
    currentViewId: string;
    displayUnsubscribe: (() => void) | null;

    // Actions
    setCursor: (nodeId: string | null) => void;
    setNavInfoText: (text: string | null) => void;
    setNavigationMode: (mode: NavigationMode) => void;
    setSimulationMode: (mode: SimulationMode) => void;
    showCommandPlane: () => void;
    hideCommandPlane: () => void;
    setFilter: (nodeIds: string[]) => void;
    clearFilter: () => void;
    setBlacklist: (nodeIds: string[]) => void;
    clearBlacklist: () => void;
    switchView: (viewId: string) => void;
    subscribeDisplay: (baseUrl: string) => () => void;
    disconnectDisplay: () => void;
    subscribe: (baseUrl: string) => () => void;
    disconnect: () => void;
}

function deriveViewFilters(displayData: ViewListOut | null, viewId: string): {
    filterNodeIds: string[] | null;
    blacklistNodeIds: string[] | null;
} {
    if (!displayData) {
        return {
            filterNodeIds: null,
            blacklistNodeIds: null,
        };
    }

    const viewData = displayData.views?.[viewId];
    if (!viewData) {
        return {
            filterNodeIds: null,
            blacklistNodeIds: null,
        };
    }

    return {
        filterNodeIds: viewData.whitelist?.length ? viewData.whitelist : null,
        blacklistNodeIds: viewData.blacklist?.length ? viewData.blacklist : null,
    };
}

export const useTodoStore = create<TodoStore>((set, get) => ({
    graphData: null,
    cursor: null,
    navInfoText: null,
    navigationMode: 'auto',
    simulationMode: 'cola',
    connectionStatus: 'disconnected',
    baseUrl: null,
    lastError: null,
    lastDataReceived: null,
    api: null,
    unsubscribe: null,
    commandPlaneVisible: false,
    filterNodeIds: null,
    blacklistNodeIds: null,
    displayData: null,
    currentViewId: 'default',
    displayUnsubscribe: null,

    setCursor: (nodeId) => set({ cursor: nodeId }),
    setNavInfoText: (text) => set({ navInfoText: text }),
    setNavigationMode: (mode) => set({ navigationMode: mode }),
    setSimulationMode: (mode) => set({ simulationMode: mode }),
    showCommandPlane: () => set({ commandPlaneVisible: true }),
    hideCommandPlane: () => set({ commandPlaneVisible: false }),
    setFilter: (nodeIds) => set({ filterNodeIds: nodeIds }),
    clearFilter: () => set({ filterNodeIds: null }),
    setBlacklist: (nodeIds) => set({ blacklistNodeIds: nodeIds }),
    clearBlacklist: () => set({ blacklistNodeIds: null }),
    switchView: (viewId) => {
        const { displayData, currentViewId } = get();
        const { filterNodeIds, blacklistNodeIds } = deriveViewFilters(displayData, viewId);
        viewTrace('Store', 'switchView', {
            fromViewId: currentViewId,
            toViewId: viewId,
            whitelistCount: filterNodeIds?.length ?? 0,
            blacklistCount: blacklistNodeIds?.length ?? 0,
        });
        set({
            currentViewId: viewId,
            filterNodeIds,
            blacklistNodeIds,
        });
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
                const { currentViewId } = get();
                const { filterNodeIds, blacklistNodeIds } = deriveViewFilters(data, currentViewId);
                viewTrace('Store', 'displaySSE:update', {
                    currentViewId,
                    viewCount: Object.keys(data.views || {}).length,
                    whitelistCount: filterNodeIds?.length ?? 0,
                    blacklistCount: blacklistNodeIds?.length ?? 0,
                });
                set({
                    displayData: data,
                    filterNodeIds,
                    blacklistNodeIds,
                });
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
            currentViewId: 'default',
            filterNodeIds: null,
            blacklistNodeIds: null,
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

        const api = new DefaultApi(new Configuration({ basePath: baseUrl }));

        const unsubscribe = subscribeToState(
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
            },
            {
                baseUrl,
                onError: (err) => {
                    console.error('SSE connection error:', err);
                    // Extract useful error message
                    let errorMessage = 'Connection failed';
                    if (err instanceof Error) {
                        errorMessage = err.message;
                    } else if (err instanceof Event) {
                        // SSE error events don't have useful info, just indicate failure
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
        const displayUnsubscribe = subscribeToDisplay(
            (data) => {
                const { currentViewId } = get();
                const { filterNodeIds, blacklistNodeIds } = deriveViewFilters(data, currentViewId);
                viewTrace('Store', 'displaySSE:update', {
                    currentViewId,
                    viewCount: Object.keys(data.views || {}).length,
                    whitelistCount: filterNodeIds?.length ?? 0,
                    blacklistCount: blacklistNodeIds?.length ?? 0,
                });
                set({
                    displayData: data,
                    filterNodeIds,
                    blacklistNodeIds,
                });
            },
            {
                baseUrl,
                onError: (err) => {
                    console.error('Display SSE connection error:', err);
                },
            }
        );

        set({ api, unsubscribe, displayUnsubscribe });

        return () => {
            get().unsubscribe?.();
            get().displayUnsubscribe?.();
            set({ unsubscribe: null, displayUnsubscribe: null, connectionStatus: 'disconnected' });
        };
    },
}));
