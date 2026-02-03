/**
 * ActionProvider - Root provider for the keyboard shortcut system.
 *
 * Responsibilities:
 * - Listen to keyboard events (via tinykeys)
 * - Maintain scope stack (LIFO)
 * - Dispatch actions to the topmost scope that handles them
 */

import React, { createContext, useContext, useEffect, useRef, useCallback, useMemo } from "react";
import { tinykeys } from "tinykeys";
import {
    KeyBindings,
    ActionCallback,
    ActionHandler,
    Scope,
    ActionContextValue,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

const ActionContext = createContext<ActionContextValue | null>(null);

export function useActionContext(): ActionContextValue {
    const ctx = useContext(ActionContext);
    if (!ctx) {
        throw new Error("useActionContext must be used within an ActionProvider");
    }
    return ctx;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionProviderProps {
    /** Maps key combos to action IDs */
    bindings: KeyBindings;
    /** Target element for key listeners (default: window) */
    target?: HTMLElement | Window;
    children: React.ReactNode;
}

export function ActionProvider({ bindings, target = window, children }: ActionProviderProps) {
    // Scope stack (LIFO - last registered = highest priority)
    const scopeStackRef = useRef<Scope[]>([]);

    // Action handlers by scope: { scopeId: { actionId: callback } }
    const handlersRef = useRef<Map<string, Map<string, ActionCallback>>>(new Map());

    // Reverse lookup: action ID -> key combo (for UI display)
    const actionToKeyRef = useRef<Map<string, string>>(new Map());

    // Build reverse lookup on bindings change
    useEffect(() => {
        const map = new Map<string, string>();
        for (const [key, actionId] of Object.entries(bindings)) {
            // If multiple keys map to same action, first one wins
            if (!map.has(actionId)) {
                map.set(actionId, key);
            }
        }
        actionToKeyRef.current = map;
    }, [bindings]);

    // ─────────────────────────────────────────────────────────────────────────
    // DISPATCH ACTION
    // ─────────────────────────────────────────────────────────────────────────

    const dispatchAction = useCallback((actionId: string) => {
        const scopeStack = scopeStackRef.current;
        const handlers = handlersRef.current;

        // Walk scope stack from top (most recent) to bottom
        for (let i = scopeStack.length - 1; i >= 0; i--) {
            const scope = scopeStack[i];

            // Check if scope is focus-restricted
            if (scope.focusRef?.current) {
                const activeElement = document.activeElement;
                const scopeElement = scope.focusRef.current;
                // Skip this scope if it doesn't contain the focused element
                if (!scopeElement.contains(activeElement) && scopeElement !== activeElement) {
                    continue;
                }
            }

            // Check if this scope has a handler for this action
            const scopeHandlers = handlers.get(scope.id);
            if (scopeHandlers) {
                const callback = scopeHandlers.get(actionId);
                if (callback) {
                    const handled = callback();
                    // If handler returns true (or void), stop propagation
                    if (handled !== false) {
                        return true;
                    }
                    // If handler returns false, continue to next scope
                }
            }
        }

        return false;
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // TINYKEYS SETUP
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        // Build tinykeys handler map: { keyCombo: () => dispatchAction(actionId) }
        const keyHandlers: Record<string, (event: KeyboardEvent) => void> = {};

        for (const [keyCombo, actionId] of Object.entries(bindings)) {
            keyHandlers[keyCombo] = (event: KeyboardEvent) => {
                const handled = dispatchAction(actionId);
                if (handled) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            };
        }

        const unsubscribe = tinykeys(target as Window, keyHandlers);

        return () => {
            unsubscribe();
        };
    }, [bindings, target, dispatchAction]);

    // ─────────────────────────────────────────────────────────────────────────
    // CONTEXT API
    // ─────────────────────────────────────────────────────────────────────────

    const registerScope = useCallback((scope: Scope) => {
        scopeStackRef.current.push(scope);
    }, []);

    const unregisterScope = useCallback((instanceId: string) => {
        scopeStackRef.current = scopeStackRef.current.filter(
            (s) => s.instanceId !== instanceId
        );
    }, []);

    const registerAction = useCallback((handler: ActionHandler) => {
        const { scopeId, actionId, callback } = handler;
        if (!handlersRef.current.has(scopeId)) {
            handlersRef.current.set(scopeId, new Map());
        }
        handlersRef.current.get(scopeId)!.set(actionId, callback);
    }, []);

    const unregisterAction = useCallback((scopeId: string, actionId: string) => {
        handlersRef.current.get(scopeId)?.delete(actionId);
    }, []);

    const getBindings = useCallback(() => bindings, [bindings]);

    const getActionForKey = useCallback(
        (key: string) => bindings[key],
        [bindings]
    );

    const getKeyForAction = useCallback(
        (actionId: string) => actionToKeyRef.current.get(actionId),
        []
    );

    const contextValue = useMemo<ActionContextValue>(
        () => ({
            registerScope,
            unregisterScope,
            registerAction,
            unregisterAction,
            getBindings,
            getActionForKey,
            getKeyForAction,
        }),
        [
            registerScope,
            unregisterScope,
            registerAction,
            unregisterAction,
            getBindings,
            getActionForKey,
            getKeyForAction,
        ]
    );

    return (
        <ActionContext.Provider value={contextValue}>
            {children}
        </ActionContext.Provider>
    );
}
