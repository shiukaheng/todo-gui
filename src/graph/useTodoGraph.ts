import { useState, useEffect, useMemo, useCallback } from 'react';
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

// Re-export types for convenience
export type { TaskListOut, TaskCreate, TaskUpdate, TaskOut, DependencyOut, OperationResult };

export interface TodoClientConfig {
  baseUrl: string;
}

export interface UseTodoGraphResult {
  graphData: TaskListOut | null;
  // Task mutations
  addTask: (task: TaskCreate) => Promise<TaskOut>;
  updateTask: (taskId: string, update: TaskUpdate) => Promise<OperationResult>;
  removeTask: (taskId: string) => Promise<OperationResult>;
  renameTask: (taskId: string, newId: string) => Promise<OperationResult>;
  // Dependency mutations
  linkTasks: (fromId: string, toId: string) => Promise<DependencyOut>;
  unlinkTasks: (fromId: string, toId: string) => Promise<OperationResult>;
  // Database
  initDb: () => Promise<OperationResult>;
}

/**
 * React hook for Todo API graph subscription
 *
 * Subscribes to real-time task updates via SSE. Automatically subscribes on mount
 * and unsubscribes on unmount.
 *
 * @param config Todo API configuration
 * @returns Current task list state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { graphData } = useTodoGraph({ baseUrl: 'http://localhost:8000' });
 *
 *   if (!graphData) return <div>Loading...</div>;
 *
 *   return <GraphViewer data={graphData} />;
 * }
 * ```
 */
export function useTodoGraph(config: TodoClientConfig | null): UseTodoGraphResult {
  const [graphData, setGraphData] = useState<TaskListOut | null>(null);

  const api = useMemo(() => {
    if (!config) return null;
    return new DefaultApi(new Configuration({ basePath: config.baseUrl }));
  }, [config?.baseUrl]);

  useEffect(() => {
    if (!config) {
      return;
    }

    const unsubscribe = subscribeToTasks(
      (data) => {
        console.log('[useNeo4jGraph] Raw TaskListOut:', {
          taskCount: Object.keys(data.tasks).length,
          taskIds: Object.keys(data.tasks),
          depCount: Object.keys(data.dependencies).length,
        });
        setGraphData(data);
      },
      {
        baseUrl: config.baseUrl,
        onError: (err) => {
          console.error('SSE connection error:', err);
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [config?.baseUrl]);

  // Task mutations
  const addTask = useCallback(
    async (task: TaskCreate): Promise<TaskOut> => {
      if (!api) throw new Error('API not initialized');
      return api.addTaskApiTasksPost({ taskCreate: task });
    },
    [api]
  );

  const updateTask = useCallback(
    async (taskId: string, update: TaskUpdate): Promise<OperationResult> => {
      if (!api) throw new Error('API not initialized');
      return api.setTaskApiTasksTaskIdPatch({ taskId, taskUpdate: update });
    },
    [api]
  );

  const removeTask = useCallback(
    async (taskId: string): Promise<OperationResult> => {
      if (!api) throw new Error('API not initialized');
      return api.removeTaskApiTasksTaskIdDelete({ taskId });
    },
    [api]
  );

  const renameTask = useCallback(
    async (taskId: string, newId: string): Promise<OperationResult> => {
      if (!api) throw new Error('API not initialized');
      return api.renameTaskApiTasksTaskIdRenamePost({
        taskId,
        renameRequest: { newId },
      });
    },
    [api]
  );

  // Dependency mutations
  const linkTasks = useCallback(
    async (fromId: string, toId: string): Promise<DependencyOut> => {
      if (!api) throw new Error('API not initialized');
      return api.linkTasksApiLinksPost({ linkRequest: { fromId, toId } });
    },
    [api]
  );

  const unlinkTasks = useCallback(
    async (fromId: string, toId: string): Promise<OperationResult> => {
      if (!api) throw new Error('API not initialized');
      return api.unlinkTasksApiLinksDelete({ linkRequest: { fromId, toId } });
    },
    [api]
  );

  // Database
  const initDb = useCallback(async (): Promise<OperationResult> => {
    if (!api) throw new Error('API not initialized');
    return api.initDbApiInitPost();
  }, [api]);

  return {
    graphData,
    addTask,
    updateTask,
    removeTask,
    renameTask,
    linkTasks,
    unlinkTasks,
    initDb,
  };
}
