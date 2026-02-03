/**
 * useActionKey - Get the keyboard shortcut for an action.
 *
 * Useful for displaying shortcuts in UI (buttons, tooltips, menus).
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const saveKey = useActionKey("save"); // e.g., "⌘S" or "Ctrl+S"
 *   return <button>Save {saveKey && `(${saveKey})`}</button>;
 * }
 * ```
 */

import { useMemo } from "react";
import { useActionContext } from "./ActionProvider";

/**
 * Format a key combo for display (e.g., "$mod+s" → "⌘S" on Mac, "Ctrl+S" on Windows)
 */
function formatKeyCombo(keyCombo: string): string {
    const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    return keyCombo
        .replace(/\$mod/g, isMac ? "⌘" : "Ctrl")
        .replace(/\+/g, isMac ? "" : "+")
        .replace(/Shift/g, isMac ? "⇧" : "Shift")
        .replace(/Alt/g, isMac ? "⌥" : "Alt")
        .replace(/Control/g, isMac ? "⌃" : "Ctrl")
        .replace(/Meta/g, isMac ? "⌘" : "Win")
        .replace(/Escape/g, "Esc")
        .replace(/ArrowUp/g, "↑")
        .replace(/ArrowDown/g, "↓")
        .replace(/ArrowLeft/g, "←")
        .replace(/ArrowRight/g, "→")
        .replace(/Backspace/g, "⌫")
        .replace(/Delete/g, "Del")
        .replace(/Enter/g, "↵")
        .replace(/Tab/g, "⇥")
        .replace(/ /g, "Space");
}

/**
 * Get the formatted keyboard shortcut for an action.
 *
 * @param actionId - The action ID to look up
 * @returns Formatted key combo string, or undefined if no binding exists
 */
export function useActionKey(actionId: string): string | undefined {
    const { getKeyForAction } = useActionContext();

    return useMemo(() => {
        const keyCombo = getKeyForAction(actionId);
        return keyCombo ? formatKeyCombo(keyCombo) : undefined;
    }, [actionId, getKeyForAction]);
}

/**
 * Get all registered action bindings (for displaying a shortcut reference).
 *
 * @returns Map of action ID → formatted key combo
 */
export function useActionBindings(): Map<string, string> {
    const { getBindings } = useActionContext();

    return useMemo(() => {
        const bindings = getBindings();
        const result = new Map<string, string>();
        for (const [key, actionId] of Object.entries(bindings)) {
            if (!result.has(actionId)) {
                result.set(actionId, formatKeyCombo(key));
            }
        }
        return result;
    }, [getBindings]);
}
