import { createContext, useContext, ReactNode } from 'react';
import { useTodoGraph, UseTodoGraphResult, TodoClientConfig } from './useTodoGraph';

const TodoContext = createContext<UseTodoGraphResult | null>(null);

interface TodoProviderProps {
  config: TodoClientConfig;
  children: ReactNode;
}

export function TodoProvider({ config, children }: TodoProviderProps) {
  const todo = useTodoGraph(config);
  return <TodoContext.Provider value={todo}>{children}</TodoContext.Provider>;
}

export function useTodo(): UseTodoGraphResult {
  const ctx = useContext(TodoContext);
  if (!ctx) {
    throw new Error('useTodo must be used within a TodoProvider');
  }
  return ctx;
}
