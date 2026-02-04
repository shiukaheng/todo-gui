import { create } from 'zustand';
import {
    subscribeToTasks,
    TaskListOut,
    DefaultApi,
    Configuration,
} from 'todo-client';

/** Navigation mode for the graph viewer */
export type NavigationMode = 'auto' | 'manual' | 'follow';

interface TodoStore {
    // State
    graphData: TaskListOut | null;
    cursor: string | null;
    navInfoText: string | null;
    navigationMode: NavigationMode;

    // API client (set after subscribe)
    api: DefaultApi | null;
    unsubscribe: (() => void) | null;

    // Actions
    setCursor: (nodeId: string | null) => void;
    setNavInfoText: (text: string | null) => void;
    setNavigationMode: (mode: NavigationMode) => void;
    subscribe: (baseUrl: string) => () => void;
}

export const useTodoStore = create<TodoStore>((set, get) => ({
    graphData: null,
    cursor: null,
    navInfoText: null,
    navigationMode: 'auto',
    api: null,
    unsubscribe: null,

    setCursor: (nodeId) => set({ cursor: nodeId }),
    setNavInfoText: (text) => set({ navInfoText: text }),
    setNavigationMode: (mode) => set({ navigationMode: mode }),

    subscribe: (baseUrl: string) => {
        // Clean up existing subscription
        get().unsubscribe?.();

        const api = new DefaultApi(new Configuration({ basePath: baseUrl }));

        const unsubscribe = subscribeToTasks(
            (data) => set({ graphData: data }),
            {
                baseUrl,
                onError: (err) => console.error('SSE connection error:', err),
            }
        );

        set({ api, unsubscribe });

        return () => {
            get().unsubscribe?.();
            set({ unsubscribe: null });
        };
    },
}));
