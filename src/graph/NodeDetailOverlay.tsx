import { useState, useEffect, useCallback } from "react";
import { useTodoStore } from "../stores/todoStore";
import { formatDistanceToNow } from "date-fns";
import { getUrgencyColorCSSFromTimestamp } from "../utils/urgencyColor";
import * as chrono from "chrono-node";

interface EditState {
    field: 'id' | 'text' | 'due' | null;
    value: string;
    parsedDate?: Date | null; // Parsed date from natural language or picker
    parseError?: string; // Error message if parsing fails
    showPicker?: boolean; // Whether to show the date picker
}

export function NodeDetailOverlay() {
    const cursor = useTodoStore((s) => s.cursor);
    const graphData = useTodoStore((s) => s.graphData);
    const api = useTodoStore((s) => s.api);

    const task = cursor && graphData?.tasks[cursor] ? graphData.tasks[cursor] : null;

    // Debug: log task data
    // Current task loaded

    // Backend provides depsClear - no need to calculate manually
    const isBlocked = task ? (task.depsClear === false) : false;

    const [edit, setEdit] = useState<EditState>({ field: null, value: '' });

    // Reset edit state when cursor changes
    useEffect(() => {
        setEdit({ field: null, value: '' });
    }, [cursor]);

    const startEdit = (field: EditState['field'], currentValue: string) => {
        if (field === 'due') {
            // For due date, start with empty natural language input
            setEdit({
                field,
                value: '',
                parsedDate: currentValue ? new Date(parseInt(currentValue) * 1000) : null,
                parseError: undefined,
                showPicker: false
            });
        } else {
            setEdit({ field, value: currentValue });
        }
    };

    const cancelEdit = () => {
        setEdit({ field: null, value: '' });
    };

    const saveEdit = async () => {
        if (!api || !task || !edit.field) return;

        // Validation: prevent saving unparsed dates
        if (edit.field === 'due' && edit.value.trim() !== '' && !edit.parsedDate) {
            console.error("Cannot save unparsed date");
            setEdit({ ...edit, parseError: 'Please enter a valid date or use the calendar.' });
            return;
        }

        try {
            if (edit.field === 'id') {
                await api.renameTaskApiTasksTaskIdRenamePost({
                    taskId: task.id,
                    renameRequest: { newId: edit.value },
                });
                // Update cursor to new ID
                useTodoStore.getState().setCursor(edit.value);
            } else {
                const update: Record<string, any> = {};
                if (edit.field === 'text') {
                    update.text = edit.value;
                } else if (edit.field === 'due') {
                    if (edit.parsedDate) {
                        update.due = Math.floor(edit.parsedDate.getTime() / 1000);
                    } else {
                        update.due = null;
                    }
                }
                await api.setTaskApiTasksTaskIdPatch({ taskId: task.id, nodeUpdate: update });
            }
            setEdit({ field: null, value: '' });
        } catch (err) {
            console.error("Failed to update task:", err);
        }
    };

    const tryParseNaturalLanguage = () => {
        if (!edit.value.trim()) {
            setEdit({ ...edit, parsedDate: null, parseError: undefined });
            return;
        }

        const parsed = chrono.parseDate(edit.value);
        if (parsed) {
            setEdit({ ...edit, parsedDate: parsed, parseError: undefined });
        } else {
            setEdit({ ...edit, parsedDate: null, parseError: 'Could not parse date. Try "tomorrow", "in 2 hours", "next monday at 3pm", or use the calendar.' });
        }
    };

    // Save edit with a specific parsed date (used by Enter key to avoid race condition)
    const saveEditWithDate = async (parsedDate: Date | null) => {
        if (!api || !task || edit.field !== 'due') return;

        try {
            const update: Record<string, any> = {};
            if (parsedDate) {
                update.due = Math.floor(parsedDate.getTime() / 1000);
            } else {
                update.due = null;
            }
            await api.setTaskApiTasksTaskIdPatch({ taskId: task.id, nodeUpdate: update });
            setEdit({ field: null, value: '' });
        } catch (err) {
            console.error("Failed to update task:", err);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (edit.field === 'due') {
                // Parse date synchronously to avoid race condition
                if (!edit.value.trim()) {
                    // Clearing the date - update state and save
                    setEdit({ ...edit, parsedDate: null, parseError: undefined });
                    // Save will happen with the updated state in next render, but we can call it
                    // Actually we need to save immediately with null date
                    saveEditWithDate(null);
                } else {
                    const parsed = chrono.parseDate(edit.value);
                    if (parsed) {
                        // Valid date - update state and save
                        setEdit({ ...edit, parsedDate: parsed, parseError: undefined });
                        saveEditWithDate(parsed);
                    } else {
                        // Invalid date - show error, don't save
                        setEdit({ ...edit, parsedDate: null, parseError: 'Could not parse date. Try "tomorrow", "in 2 hours", "next monday at 3pm", or use the calendar.' });
                    }
                }
            } else {
                saveEdit();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };

    // Space to toggle completion (disabled for gates or blocked nodes)
    const canToggle = task && task.nodeType === "Task" && !isBlocked;

    const toggleCompletion = useCallback(async () => {
        if (!task || !api || task.nodeType !== "Task" || isBlocked) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({
                taskId: task.id,
                nodeUpdate: { completed: !task.completed },
            });
        } catch (err) {
            console.error("Failed to toggle completion:", err);
        }
    }, [task, api, isBlocked]);

    const setNodeType = useCallback(async (newType: string) => {
        if (!task || !api) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({
                taskId: task.id,
                nodeUpdate: { nodeType: newType },
            });
        } catch (err) {
            console.error("Failed to change node type:", err);
        }
    }, [task, api]);

    // Global keyboard handler for space
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === ' ' && canToggle) {
                e.preventDefault();
                toggleCompletion();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [canToggle, toggleCompletion]);

    if (!task) return null;

    const formatDateRelative = (ts: number | null) => {
        if (!ts) return "-";
        const date = new Date(ts * 1000);
        return formatDistanceToNow(date, { addSuffix: true });
    };

    const formatDateAbsolute = (ts: number | null) => {
        if (!ts) return "";
        const date = new Date(ts * 1000);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
    };

    const formatDueDateForInput = (ts: number | null) => {
        if (!ts) return "";
        const date = new Date(ts * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // YYYY-MM-DD in local time
    };

    const formatDueTimeForInput = (ts: number | null) => {
        if (!ts) return "";
        const date = new Date(ts * 1000);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`; // HH:MM in local time
    };

    // Format Date object for date input (local time, not UTC)
    const formatDateObjectForInput = (date: Date | null) => {
        if (!date) return "";
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // YYYY-MM-DD in local time
    };

    // Format Date object for time input (local time, not UTC)
    const formatTimeObjectForInput = (date: Date | null) => {
        if (!date) return "";
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`; // HH:MM in local time
    };

    const clearDue = async () => {
        if (!api || !task) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({ taskId: task.id, nodeUpdate: { due: null } });
            setEdit({ field: null, value: '' });
        } catch (err) {
            console.error("Failed to clear due date:", err);
        }
    };

    const isEditing = (field: EditState['field']) => edit.field === field;

    return (
        <div className="text-white/80 font-mono text-sm select-none">
            {/* ID - prominent and editable */}
            <div className="mb-1">
                {isEditing('id') ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={edit.value}
                            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="bg-white/10 border border-white/30 rounded px-2 py-0.5 text-white outline-none text-base"
                        />
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300 text-xs">save</button>
                        <button onClick={cancelEdit} className="text-white/40 hover:text-white/60 text-xs">cancel</button>
                    </div>
                ) : (
                    <span
                        onClick={() => startEdit('id', task.id)}
                        className="cursor-pointer hover:text-white text-white/90"
                    >
                        {task.id}
                    </span>
                )}
            </div>

            {/* Text */}
            <div className="mb-1">
                {isEditing('text') ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={edit.value as string}
                            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="bg-white/10 border border-white/30 rounded px-2 py-0.5 text-white outline-none text-base"
                        />
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300">save</button>
                        <button onClick={cancelEdit} className="text-white/40 hover:text-white/60">cancel</button>
                    </div>
                ) : (
                    <span
                        onClick={() => startEdit('text', task.text)}
                        className="cursor-pointer hover:text-white"
                    >
                        {task.text || <span className="text-white/30 italic">no text</span>}
                    </span>
                )}
            </div>

            {/* Status line */}
            <div className="flex gap-4 text-xs items-center">
                {/* Node type selector */}
                <select
                    value={task.nodeType || "Task"}
                    onChange={(e) => setNodeType(e.target.value)}
                    className="bg-white/10 text-white hover:text-white border border-white/20 rounded px-2 py-1 cursor-pointer text-xs"
                    style={{ color: 'white' }}
                >
                    <option value="Task" style={{ backgroundColor: '#1f2937', color: 'white' }}>task</option>
                    <option value="And" style={{ backgroundColor: '#1f2937', color: 'white' }}>and (all)</option>
                    <option value="Or" style={{ backgroundColor: '#1f2937', color: 'white' }}>or (any)</option>
                    <option value="Not" style={{ backgroundColor: '#1f2937', color: 'white' }}>not (none)</option>
                    <option value="ExactlyOne" style={{ backgroundColor: '#1f2937', color: 'white' }}>xor (one)</option>
                </select>

                {/* Status: blocked > completed > actionable */}
                {isBlocked ? (
                    <span className="text-yellow-500/70">blocked</span>
                ) : (
                    <span
                        onClick={() => canToggle && toggleCompletion()}
                        className={
                            task.nodeType !== "Task"
                                ? "text-white/30"
                                : task.calculatedValue
                                    ? "text-green-400 cursor-pointer hover:text-green-300"
                                    : "text-orange-400 cursor-pointer hover:text-orange-300"
                        }
                    >
                        {task.calculatedValue ? "completed" : "actionable"}
                    </span>
                )}

                {/* Due - displays calculatedDue (inferred), edits task.due (own) */}
                {isEditing('due') ? (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            {!edit.showPicker ? (
                                <>
                                    <input
                                        type="text"
                                        value={edit.value}
                                        onChange={(e) => setEdit({ ...edit, value: e.target.value, parseError: undefined })}
                                        onKeyDown={handleKeyDown}
                                        onBlur={tryParseNaturalLanguage}
                                        autoFocus
                                        className="bg-white/10 border border-white/30 rounded px-2 py-0.5 text-white text-base outline-none flex-1"
                                    />
                                    <button
                                        onClick={() => setEdit({ ...edit, showPicker: true })}
                                        className="text-white hover:text-white/80 px-2"
                                        title="Open calendar"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect x="2" y="3" width="12" height="11" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                                            <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5"/>
                                            <line x1="5" y1="1" x2="5" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                            <line x1="11" y1="1" x2="11" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                        </svg>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <input
                                        type="date"
                                        value={formatDateObjectForInput(edit.parsedDate || null)}
                                        onChange={(e) => {
                                            const newDate = e.target.value ? new Date(e.target.value) : null;
                                            // Preserve time if it exists
                                            if (newDate && edit.parsedDate) {
                                                newDate.setHours(edit.parsedDate.getHours(), edit.parsedDate.getMinutes());
                                            }
                                            setEdit({ ...edit, parsedDate: newDate, parseError: undefined });
                                        }}
                                        onKeyDown={handleKeyDown}
                                        autoFocus
                                        className="bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white text-base outline-none"
                                    />
                                    <input
                                        type="time"
                                        value={formatTimeObjectForInput(edit.parsedDate || null)}
                                        onChange={(e) => {
                                            if (edit.parsedDate && e.target.value) {
                                                const [hours, minutes] = e.target.value.split(':').map(Number);
                                                const newDate = new Date(edit.parsedDate);
                                                newDate.setHours(hours, minutes);
                                                setEdit({ ...edit, parsedDate: newDate, parseError: undefined });
                                            }
                                        }}
                                        onKeyDown={handleKeyDown}
                                        className="bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white text-base outline-none w-20"
                                    />
                                    <button
                                        onClick={() => setEdit({ ...edit, showPicker: false })}
                                        className="text-white/60 hover:text-white/80 text-xs"
                                        title="Back to text input"
                                    >
                                        text
                                    </button>
                                </>
                            )}
                        </div>
                        {edit.parsedDate && !edit.showPicker && (
                            <div className="text-green-400 text-xs">
                                → {edit.parsedDate.toLocaleString()}
                            </div>
                        )}
                        {edit.parseError && (
                            <div className="text-red-400 text-xs">
                                {edit.parseError}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={saveEdit}
                                disabled={edit.field === 'due' && edit.value.trim() !== '' && !edit.parsedDate}
                                className="text-green-400 hover:text-green-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                            >
                                save
                            </button>
                            <button onClick={clearDue} className="text-red-400 hover:text-red-300">clear</button>
                            <button onClick={cancelEdit} className="text-white/40 hover:text-white/60">cancel</button>
                        </div>
                    </div>
                ) : (
                    <span
                        onClick={() => startEdit('due', task.due?.toString() || '')}
                        className="cursor-pointer hover:opacity-80"
                        style={task.calculatedDue && !task.calculatedCompleted ? { color: getUrgencyColorCSSFromTimestamp(task.calculatedDue) } : undefined}
                    >
                        due: {task.calculatedDue
                            ? `${formatDateRelative(task.calculatedDue)} / ${formatDateAbsolute(task.calculatedDue)}`
                            : "-"}
                    </span>
                )}
            </div>
        </div>
    );
}
