import { useState, useEffect } from 'react';
import { subscribeToTasks, TaskListOut } from 'todo-client';

export interface TodoClientConfig {
  baseUrl: string;
}

export interface UseTodoGraphResult {
  graphData: TaskListOut | null;
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

  return { graphData };
}
