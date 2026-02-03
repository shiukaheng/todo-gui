/**
 * Keyboard Shortcut System Types
 *
 * Three-layer architecture:
 * 1. Key Bindings: maps keyboard shortcuts to action IDs (configurable)
 * 2. Action IDs: semantic action names (e.g., "save", "close", "undo")
 * 3. Scoped Callbacks: component-defined handlers per scope
 */

/**
 * Maps keyboard shortcut strings to action IDs.
 * Uses tinykeys format: "$mod+s", "Escape", "Shift+Delete", etc.
 * $mod = Cmd on Mac, Ctrl on Windows/Linux
 */
export type KeyBindings = Record<string, string>;

/**
 * Action callback function.
 * Return true to indicate the action was handled (stops propagation).
 * Return false/undefined to let it bubble to lower scopes.
 */
export type ActionCallback = () => boolean | void;

/**
 * Registered action handler within a scope.
 */
export interface ActionHandler {
    actionId: string;
    callback: ActionCallback;
    scopeId: string;
}

/**
 * A scope in the scope stack.
 */
export interface Scope {
    id: string;
    /** Unique instance ID (for multiple components with same scope name) */
    instanceId: string;
    /** Optional: only active when this element has focus */
    focusRef?: React.RefObject<HTMLElement>;
}

/**
 * Context value provided by ActionProvider.
 */
export interface ActionContextValue {
    /** Register a scope (called by useActionScope) */
    registerScope: (scope: Scope) => void;
    /** Unregister a scope (called on unmount) */
    unregisterScope: (instanceId: string) => void;
    /** Register an action handler (called by useAction) */
    registerAction: (handler: ActionHandler) => void;
    /** Unregister an action handler (called on unmount) */
    unregisterAction: (scopeId: string, actionId: string) => void;
    /** Get current key bindings (for displaying shortcuts) */
    getBindings: () => KeyBindings;
    /** Get action ID for a key combo (for displaying shortcuts) */
    getActionForKey: (key: string) => string | undefined;
    /** Get key combo for an action (for displaying shortcuts) */
    getKeyForAction: (actionId: string) => string | undefined;
}
