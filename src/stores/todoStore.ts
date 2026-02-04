import { create } from 'zustand';
import {
    subscribeToTasks,
    TaskListOut,
    TaskCreate,
    TaskUpdate,
    TaskOut,
    DependencyOut,
    OperationResult,
    DefaultApi,
    Configuration,
} from 'todo-client';

interface TodoStore {
    // State
    graphData: TaskListOut | null;
    cursor: string | null;

    // Setters
    setCursor: (nodeId: string | null) => void;

    // Subscription
    subscribe: (baseUrl: string) => () => void;

    // Mutations
    addTask: (task: TaskCreate) => Promise<TaskOut>;
    updateTask: (taskId: string, update: TaskUpdate) => Promise<OperationResult>;
    removeTask: (taskId: string) => Promise<OperationResult>;
    renameTask: (taskId: string, newId: string) => Promise<OperationResult>;
    linkTasks: (fromId: string, toId: string) => Promise<DependencyOut>;
    unlinkTasks: (fromId: string, toId: string) => Promise<OperationResult>;
}

let api: DefaultApi | null = null;

export const useTodoStore = create<TodoStore>((set, get) => ({
    graphData: null,
    cursor: null,

    setCursor: (nodeId) => set({ cursor: nodeId }),

    subscribe: (baseUrl: string) => {
        api = new DefaultApi(new Configuration({ basePath: baseUrl }));

        const unsubscribe = subscribeToTasks(
            (data) => set({ graphData: data }),
            {
                baseUrl,
                onError: (err) => console.error('SSE connection error:', err),
            }
        );

        return unsubscribe;
    },

    addTask: async (task) => {
        if (!api) throw new Error('Not connected');
        return api.addTaskApiTasksPost({ taskCreate: task });
    },

    updateTask: async (taskId, update) => {
        if (!api) throw new Error('Not connected');
        return api.setTaskApiTasksTaskIdPatch({ taskId, taskUpdate: update });
    },

    removeTask: async (taskId) => {
        if (!api) throw new Error('Not connected');
        return api.removeTaskApiTasksTaskIdDelete({ taskId });
    },

    renameTask: async (taskId, newId) => {
        if (!api) throw new Error('Not connected');
        return api.renameTaskApiTasksTaskIdRenamePost({ taskId, renameRequest: { newId } });
    },

    linkTasks: async (fromId, toId) => {
        if (!api) throw new Error('Not connected');
        return api.linkTasksApiLinksPost({ linkRequest: { fromId, toId } });
    },

    unlinkTasks: async (fromId, toId) => {
        if (!api) throw new Error('Not connected');
        return api.unlinkTasksApiLinksDelete({ linkRequest: { fromId, toId } });
    },
}));
