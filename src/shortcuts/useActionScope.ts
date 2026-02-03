/**
 * useActionScope - Declare an action scope for a component.
 *
 * The scope is pushed onto the stack when mounted and popped when unmounted.
 * Returns a scoped `useAction` function to bind actions to this scope.
 *
 * @example
 * ```tsx
 * function Modal() {
 *   const { useAction } = useActionScope("modal");
 *   useAction("close", () => closeModal());
 *   return <div>...</div>;
 * }
 * ```
 *
 * @example With focus restriction
 * ```tsx
 * function GraphViewer() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { useAction } = useActionScope("graph", { focusRef: containerRef });
 *   useAction("delete", () => deleteNode());
 *   return <div ref={containerRef} tabIndex={0}>...</div>;
 * }
 * ```
 */

import { useEffect, useRef, useCallback } from "react";
import { useActionContext } from "./ActionProvider";
import { ActionCallback } from "./types";

let scopeInstanceCounter = 0;

export interface UseActionScopeOptions {
    /**
     * If provided, the scope is only active when this element
     * (or a descendant) has focus.
     */
    focusRef?: React.RefObject<HTMLElement>;
}

export interface UseActionScopeResult {
    /**
     * Bind an action callback to this scope.
     * The callback is registered on mount and unregistered on unmount.
     */
    useAction: (actionId: string, callback: ActionCallback) => void;

    /**
     * The scope ID (useful for debugging).
     */
    scopeId: string;
}

export function useActionScope(
    scopeId: string,
    options: UseActionScopeOptions = {}
): UseActionScopeResult {
    const { registerScope, unregisterScope, registerAction, unregisterAction } =
        useActionContext();
    const instanceIdRef = useRef<string | null>(null);
    const { focusRef } = options;

    // Generate unique instance ID on first render
    if (instanceIdRef.current === null) {
        instanceIdRef.current = `${scopeId}-${++scopeInstanceCounter}`;
    }
    const instanceId = instanceIdRef.current;

    // Register/unregister scope
    useEffect(() => {
        registerScope({
            id: scopeId,
            instanceId,
            focusRef,
        });

        return () => {
            unregisterScope(instanceId);
        };
    }, [scopeId, instanceId, focusRef, registerScope, unregisterScope]);

    // Create a scoped useAction hook
    // Note: This is a custom hook factory - the returned function IS a hook
    // and must follow hook rules (only call at top level of components)
    const useScopedAction = useCallback(
        function useScopedAction(actionId: string, callback: ActionCallback) {
            // Store callback in ref to avoid re-registering on every render
            const callbackRef = useRef(callback);
            callbackRef.current = callback;

            useEffect(() => {
                // Wrap callback to always use latest version
                const wrappedCallback: ActionCallback = () => {
                    return callbackRef.current();
                };

                registerAction({
                    scopeId,
                    actionId,
                    callback: wrappedCallback,
                });

                return () => {
                    unregisterAction(scopeId, actionId);
                };
            }, [actionId]); // Only re-register if actionId changes
        },
        [scopeId, registerAction, unregisterAction]
    );

    return {
        useAction: useScopedAction,
        scopeId,
    };
}
