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
        // Ctrl+C to clear input
        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            setInput('', 0);
            return;
        }

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
                historyUp();
                break;
            case 'ArrowDown':
                e.preventDefault();
                historyDown();
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
        <div className="absolute bottom-8 left-8 w-96 font-mono text-sm select-none z-10">
            {/* Completions */}
            {state.completions.length > 0 && (
                <div className="mb-1 max-h-40 overflow-y-auto">
                    {state.completions.map((completion, index) => (
                        <div
                            key={`${completion.value}-${index}`}
                            className={`cursor-pointer ${
                                index === state.selectedCompletionIndex
                                    ? 'text-white'
                                    : 'text-white/40 hover:text-white/60'
                            }`}
                            onClick={() => {
                                controller.selectCompletion(index);
                                applyCompletion();
                                inputRef.current?.focus();
                            }}
                        >
                            <span className={getCompletionTypeColor(completion.type)}>
                                {completion.value}
                            </span>
                            {completion.description && (
                                <span className="text-white/30 ml-2">
                                    {completion.description}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="flex items-center text-white/80">
                <span className="text-white/50">&gt;</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={state.input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                        // Keep focus on input while command plane is visible
                        setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="flex-1 bg-transparent ml-1 text-white outline-none text-base"
                    placeholder=""
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                />
            </div>
        </div>
    );
}
