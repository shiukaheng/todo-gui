/**
 * Keyboard Shortcut System
 *
 * A three-layer architecture for keyboard shortcuts:
 * 1. Key Bindings: configurable mapping of key combos to action IDs
 * 2. Action IDs: semantic action names (e.g., "save", "close", "undo")
 * 3. Scoped Callbacks: component-defined handlers per scope
 *
 * @example
 * ```tsx
 * // 1. Wrap app with provider and define key bindings
 * const bindings = {
 *   "$mod+s": "save",
 *   "Escape": "close",
 *   "$mod+z": "undo",
 * };
 *
 * function App() {
 *   return (
 *     <ActionProvider bindings={bindings}>
 *       <GraphViewer />
 *     </ActionProvider>
 *   );
 * }
 *
 * // 2. Define scopes and bind actions in components
 * function GraphViewer() {
 *   const { useAction } = useActionScope("graph");
 *
 *   useAction("save", () => {
 *     saveGraph();
 *   });
 *
 *   useAction("undo", () => {
 *     undoLastAction();
 *   });
 *
 *   return <div>...</div>;
 * }
 *
 * // 3. Higher priority scopes (mounted later) take precedence
 * function Modal() {
 *   const { useAction } = useActionScope("modal");
 *
 *   // This "save" will be called instead of graph's "save" when modal is open
 *   useAction("save", () => {
 *     saveModalData();
 *   });
 *
 *   useAction("close", () => {
 *     closeModal();
 *   });
 *
 *   return <div>...</div>;
 * }
 *
 * // 4. Display shortcuts in UI
 * function SaveButton() {
 *   const saveKey = useActionKey("save"); // "⌘S" on Mac, "Ctrl+S" on Windows
 *   return <button>Save {saveKey && `(${saveKey})`}</button>;
 * }
 * ```
 */

export { ActionProvider, useActionContext } from "./ActionProvider";
export type { ActionProviderProps } from "./ActionProvider";

export { useActionScope } from "./useActionScope";
export type { UseActionScopeOptions, UseActionScopeResult } from "./useActionScope";

export { useActionKey, useActionBindings } from "./useActionKey";

export type {
    KeyBindings,
    ActionCallback,
    ActionHandler,
    Scope,
    ActionContextValue,
} from "./types";
