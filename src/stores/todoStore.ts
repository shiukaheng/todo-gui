import { create } from 'zustand';
import {
    type AppState,
    type ViewListOut,
    DefaultApi,
    Configuration,
    subscribeToState,
    subscribeToDisplay,
} from 'todo-client';

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
        const { displayData } = get();
        const viewData = displayData?.views?.[viewId];
        const filterNodeIds = viewData?.whitelist?.length
            ? viewData.whitelist
            : null;
        const blacklistNodeIds = viewData?.blacklist?.length
            ? viewData.blacklist
            : null;
        set({ currentViewId: viewId, filterNodeIds, blacklistNodeIds });
    },

    disconnectDisplay: () => {
        get().displayUnsubscribe?.();
        set({ displayUnsubscribe: null, displayData: null });
    },

    subscribeDisplay: (baseUrl: string) => {
        get().displayUnsubscribe?.();

        const unsubscribe = subscribeToDisplay(
            (data) => {
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
            currentViewId: 'default',
            filterNodeIds: null,
            blacklistNodeIds: null,
        });
    },

    subscribe: (baseUrl: string) => {
        // Clean up existing subscription
        get().unsubscribe?.();

        set({
            connectionStatus: 'connecting',
            baseUrl,
            lastError: null,
        });

        const api = new DefaultApi(new Configuration({ basePath: baseUrl }));

        const unsubscribe = subscribeToState(
            (data) => {
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
                set({ displayData: data });
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
