import { useEffect } from 'react';

/**
 * WARNING: This is an interim solution for handling keyboard shortcuts.
 * It will likely need to be replaced with a more graceful, centrally managed
 * solution (e.g., a keyboard shortcut manager that handles conflicts,
 * priority, and context-aware bindings).
 */
export function useKeydown(key: string, callback: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === key) {
        callback();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback]);
}
