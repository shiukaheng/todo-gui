import { create } from 'zustand';
import {
    type NodeListOut,
    DefaultApi,
    Configuration,
    subscribeToTasks,
} from 'todo-client';

/** Navigation mode for the graph viewer */
export type NavigationMode = 'auto' | 'manual' | 'follow' | 'fly';

/** Simulation mode for the graph layout */
export type SimulationMode = 'cola' | 'force';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface TodoStore {
    // State
    graphData: NodeListOut | null;
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

    // Actions
    setCursor: (nodeId: string | null) => void;
    setNavInfoText: (text: string | null) => void;
    setNavigationMode: (mode: NavigationMode) => void;
    setSimulationMode: (mode: SimulationMode) => void;
    showCommandPlane: () => void;
    hideCommandPlane: () => void;
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

    setCursor: (nodeId) => set({ cursor: nodeId }),
    setNavInfoText: (text) => set({ navInfoText: text }),
    setNavigationMode: (mode) => set({ navigationMode: mode }),
    setSimulationMode: (mode) => set({ simulationMode: mode }),
    showCommandPlane: () => set({ commandPlaneVisible: true }),
    hideCommandPlane: () => set({ commandPlaneVisible: false }),

    disconnect: () => {
        get().unsubscribe?.();
        set({
            unsubscribe: null,
            api: null,
            connectionStatus: 'disconnected',
            graphData: null,
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

        const unsubscribe = subscribeToTasks(
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

        set({ api, unsubscribe });

        return () => {
            get().unsubscribe?.();
            set({ unsubscribe: null, connectionStatus: 'disconnected' });
        };
    },
}));
