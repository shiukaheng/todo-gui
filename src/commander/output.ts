/**
 * Command output system - captures and stores command output.
 */

import { create } from 'zustand';

export interface OutputLine {
    id: number;
    text: string;
    type: 'info' | 'error' | 'success';
    timestamp: number;
}

interface OutputStore {
    lines: OutputLine[];
    nextId: number;
    maxLines: number;
    print: (text: string, type?: OutputLine['type']) => void;
    error: (text: string) => void;
    success: (text: string) => void;
    clear: () => void;
}

export const useOutputStore = create<OutputStore>((set, get) => ({
    lines: [],
    nextId: 1,
    maxLines: 50,

    print: (text, type = 'info') => {
        const { nextId, lines, maxLines } = get();
        const newLine: OutputLine = {
            id: nextId,
            text,
            type,
            timestamp: Date.now(),
        };
        const newLines = [...lines, newLine].slice(-maxLines);
        set({ lines: newLines, nextId: nextId + 1 });
    },

    error: (text) => get().print(text, 'error'),
    success: (text) => get().print(text, 'success'),

    clear: () => set({ lines: [] }),
}));

/** Command output interface for use in commands */
export const output = {
    print: (text: string) => useOutputStore.getState().print(text),
    error: (text: string) => useOutputStore.getState().error(text),
    success: (text: string) => useOutputStore.getState().success(text),
    clear: () => useOutputStore.getState().clear(),
};
