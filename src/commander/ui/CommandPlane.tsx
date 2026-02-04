/**
 * CommandPlane - Overlay command input with tab completion.
 */

import { useRef, useEffect } from 'react';
import { UseCommandPlaneReturn } from './useCommandPlane';

interface CommandPlaneProps {
    controller: UseCommandPlaneReturn;
}

export function CommandPlane({ controller }: CommandPlaneProps) {
    const { state, setInput, applyCompletion, nextCompletion, prevCompletion, execute, hide, historyUp, historyDown } = controller;
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when visible
    useEffect(() => {
        if (state.visible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [state.visible]);

    if (!state.visible) {
        return null;
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey) {
                    prevCompletion();
                } else if (state.selectedCompletionIndex >= 0) {
                    applyCompletion();
                } else {
                    nextCompletion();
                }
                break;
            case 'Enter':
                e.preventDefault();
                execute();
                break;
            case 'Escape':
                e.preventDefault();
                hide();
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (state.completions.length > 0) {
                    prevCompletion();
                } else {
                    historyUp();
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (state.completions.length > 0) {
                    nextCompletion();
                } else {
                    historyDown();
                }
                break;
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value, e.target.selectionStart ?? e.target.value.length);
    };

    const getCompletionTypeColor = (type: string) => {
        switch (type) {
            case 'command': return 'text-blue-400';
            case 'option': return 'text-yellow-400';
            case 'value': return 'text-green-400';
            default: return 'text-white';
        }
    };

    return (
        <div className="absolute bottom-4 left-4 right-4 max-w-xl">
            {/* Completions dropdown (above input) */}
            {state.completions.length > 0 && (
                <div className="mb-1 bg-gray-900/95 border border-white/20 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {state.completions.map((completion, index) => (
                        <div
                            key={`${completion.value}-${index}`}
                            className={`px-3 py-1.5 flex items-center gap-3 cursor-pointer ${
                                index === state.selectedCompletionIndex
                                    ? 'bg-white/20'
                                    : 'hover:bg-white/10'
                            }`}
                            onClick={() => {
                                controller.selectCompletion(index);
                                applyCompletion();
                                inputRef.current?.focus();
                            }}
                        >
                            <span className={`font-mono ${getCompletionTypeColor(completion.type)}`}>
                                {completion.value}
                            </span>
                            {completion.description && (
                                <span className="text-white/50 text-sm truncate">
                                    {completion.description}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="flex items-center bg-gray-900/95 border border-white/20 rounded-lg">
                <span className="pl-3 text-white/50 font-mono">&gt;</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={state.input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent px-2 py-2 text-white font-mono outline-none"
                    placeholder="type a command..."
                    autoComplete="off"
                    spellCheck={false}
                />
                <button
                    onClick={hide}
                    className="px-3 py-2 text-white/50 hover:text-white/80"
                    title="close (esc)"
                >
                    &times;
                </button>
            </div>

            {/* Hint */}
            <div className="mt-1 text-xs text-white/30 font-mono">
                Tab: complete | Enter: execute | Esc: close | Up/Down: history
            </div>
        </div>
    );
}
