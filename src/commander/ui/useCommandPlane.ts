/**
 * useCommandPlane - Hook for managing command plane state.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { type CommandPlaneState, type CompletionSuggestion } from '../types';
import { commandRegistry } from '../CommandRegistry';

const INITIAL_STATE: CommandPlaneState = {
    visible: false,
    input: '',
    cursorPosition: 0,
    completions: [],
    selectedCompletionIndex: -1,
    history: [],
    historyIndex: -1,
};

export interface UseCommandPlaneReturn {
    state: CommandPlaneState;
    show: () => void;
    hide: () => void;
    setInput: (input: string, cursorPosition?: number) => void;
    selectCompletion: (index: number) => void;
    applyCompletion: () => void;
    nextCompletion: () => void;
    prevCompletion: () => void;
    execute: () => Promise<void>;
    historyUp: () => void;
    historyDown: () => void;
}

export function useCommandPlane(): UseCommandPlaneReturn {
    const [state, setState] = useState<CommandPlaneState>(INITIAL_STATE);
    const inputRef = useRef(state.input);

    // Keep ref in sync
    useEffect(() => {
        inputRef.current = state.input;
    }, [state.input]);

    const updateCompletions = useCallback((input: string, cursorPosition: number) => {
        const completions = commandRegistry.complete(input, cursorPosition);
        setState(s => ({
            ...s,
            completions,
            selectedCompletionIndex: completions.length > 0 ? 0 : -1,
        }));
    }, []);

    const show = useCallback(() => {
        setState(s => ({ ...s, visible: true }));
    }, []);

    const hide = useCallback(() => {
        setState(s => ({
            ...s,
            visible: false,
            input: '',
            cursorPosition: 0,
            completions: [],
            selectedCompletionIndex: -1,
            historyIndex: -1,
        }));
    }, []);

    const setInput = useCallback((input: string, cursorPosition?: number) => {
        const pos = cursorPosition ?? input.length;
        setState(s => ({
            ...s,
            input,
            cursorPosition: pos,
            historyIndex: -1,
        }));
        updateCompletions(input, pos);
    }, [updateCompletions]);

    const selectCompletion = useCallback((index: number) => {
        setState(s => ({
            ...s,
            selectedCompletionIndex: Math.max(-1, Math.min(s.completions.length - 1, index)),
        }));
    }, []);

    const applyCompletion = useCallback(() => {
        setState(s => {
            if (s.selectedCompletionIndex < 0 || s.selectedCompletionIndex >= s.completions.length) {
                return s;
            }

            const completion = s.completions[s.selectedCompletionIndex];
            const inputUpToCursor = s.input.slice(0, s.cursorPosition);

            // Find the start of the current token (respecting quotes)
            let tokenStart = inputUpToCursor.length;
            let inQuote: string | null = null;
            for (let i = 0; i < inputUpToCursor.length; i++) {
                const char = inputUpToCursor[i];
                if (inQuote) {
                    if (char === inQuote) inQuote = null;
                } else if (char === '"' || char === "'") {
                    inQuote = char;
                    tokenStart = i;
                } else if (char === ' ') {
                    tokenStart = i + 1;
                }
            }

            // Build the completion value (quote if contains spaces)
            let completionValue = completion.value;
            if (completionValue.includes(' ') && !completionValue.startsWith('"') && !completionValue.startsWith("'")) {
                completionValue = `"${completionValue}"`;
            }

            const beforeToken = s.input.slice(0, tokenStart);
            const afterCursor = s.input.slice(s.cursorPosition);
            const newInput = beforeToken + completionValue + ' ' + afterCursor.trimStart();
            const newPos = beforeToken.length + completionValue.length + 1;

            // Get new completions
            const newCompletions = commandRegistry.complete(newInput, newPos);

            return {
                ...s,
                input: newInput,
                cursorPosition: newPos,
                completions: newCompletions,
                selectedCompletionIndex: newCompletions.length > 0 ? 0 : -1,
            };
        });
    }, []);

    const nextCompletion = useCallback(() => {
        setState(s => ({
            ...s,
            selectedCompletionIndex: s.completions.length > 0
                ? (s.selectedCompletionIndex + 1) % s.completions.length
                : -1,
        }));
    }, []);

    const prevCompletion = useCallback(() => {
        setState(s => ({
            ...s,
            selectedCompletionIndex: s.completions.length > 0
                ? (s.selectedCompletionIndex - 1 + s.completions.length) % s.completions.length
                : -1,
        }));
    }, []);

    const execute = useCallback(async () => {
        const input = inputRef.current.trim();
        if (!input) {
            hide();
            return;
        }

        // Add to history
        setState(s => ({
            ...s,
            history: [...s.history.filter(h => h !== input), input],
        }));

        const result = await commandRegistry.execute(input);
        if (!result.success && result.error) {
            console.error('Command error:', result.error);
        }

        hide();
    }, [hide]);

    const historyUp = useCallback(() => {
        setState(s => {
            if (s.history.length === 0) return s;
            const newIndex = s.historyIndex < 0
                ? s.history.length - 1
                : Math.max(0, s.historyIndex - 1);
            const input = s.history[newIndex] || '';
            return {
                ...s,
                historyIndex: newIndex,
                input,
                cursorPosition: input.length,
                completions: commandRegistry.complete(input, input.length),
                selectedCompletionIndex: -1,
            };
        });
    }, []);

    const historyDown = useCallback(() => {
        setState(s => {
            if (s.historyIndex < 0) return s;
            const newIndex = s.historyIndex + 1;
            if (newIndex >= s.history.length) {
                return {
                    ...s,
                    historyIndex: -1,
                    input: '',
                    cursorPosition: 0,
                    completions: commandRegistry.complete('', 0),
                    selectedCompletionIndex: -1,
                };
            }
            const input = s.history[newIndex] || '';
            return {
                ...s,
                historyIndex: newIndex,
                input,
                cursorPosition: input.length,
                completions: commandRegistry.complete(input, input.length),
                selectedCompletionIndex: -1,
            };
        });
    }, []);

    return {
        state,
        show,
        hide,
        setInput,
        selectCompletion,
        applyCompletion,
        nextCompletion,
        prevCompletion,
        execute,
        historyUp,
        historyDown,
    };
}
