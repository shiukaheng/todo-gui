import React, { useEffect, useState, useCallback } from "react";
import { SelectionModalProps } from "./types";

export const NodeSelectionModal: React.FC<SelectionModalProps> = ({
    options,
    onSelect,
    onClose,
    title,
}) => {
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Number keys 1-9 select options 1-9
        if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (index < options.length) {
                onSelect(options[index].nodeId);
            }
            return;
        }

        // 0 selects option 10
        if (e.key === '0') {
            if (options.length >= 10) {
                onSelect(options[9].nodeId);
            }
            return;
        }

        // Arrow navigation
        if (e.key === 'ArrowUp') {
            setHighlightedIndex(prev => Math.max(0, prev - 1));
            return;
        }

        if (e.key === 'ArrowDown') {
            setHighlightedIndex(prev => Math.min(options.length - 1, prev + 1));
            return;
        }

        // Enter confirms highlighted selection
        if (e.key === 'Enter') {
            onSelect(options[highlightedIndex].nodeId);
            return;
        }

        // Escape closes modal
        if (e.key === 'Escape') {
            onClose();
            return;
        }
    }, [options, highlightedIndex, onSelect, onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Reset highlighted index when options change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [options]);

    return (
        <div
            className="fixed inset-0 pointer-events-none z-[1001]"
            onClick={(e) => {
                e.stopPropagation();
                onClose();
            }}
        >
            <div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto backdrop-blur-xl bg-zinc-800/80 rounded-xl p-4 min-w-[200px]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="text-white text-lg font-medium mb-3">{title}</div>
                <div className="flex flex-col gap-1">
                    {options.map((option, index) => {
                        const shortcutKey = index < 9 ? (index + 1).toString() : index === 9 ? '0' : null;
                        const isHighlighted = index === highlightedIndex;

                        return (
                            <div
                                key={option.nodeId}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                    isHighlighted
                                        ? 'bg-white/20'
                                        : 'hover:bg-white/10'
                                }`}
                                onClick={() => onSelect(option.nodeId)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {shortcutKey && (
                                    <span className="text-zinc-400 text-sm font-mono w-5 text-center">
                                        {shortcutKey}
                                    </span>
                                )}
                                <span className="text-white">{option.label}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-3 text-zinc-500 text-xs">
                    Press 1-9 to select, Enter to confirm, Esc to cancel
                </div>
            </div>
        </div>
    );
};
