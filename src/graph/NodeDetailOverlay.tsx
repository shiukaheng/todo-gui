import { useState, useEffect, useCallback } from "react";
import { useTodoStore } from "../stores/todoStore";
import { formatDistanceToNow } from "date-fns";
import { getUrgencyColorCSSFromTimestamp } from "../utils/urgencyColor";

interface EditState {
    field: 'id' | 'text' | 'due' | null;
    value: string;
    timeValue?: string; // Optional time for due date editing
}

export function NodeDetailOverlay() {
    const cursor = useTodoStore((s) => s.cursor);
    const graphData = useTodoStore((s) => s.graphData);
    const api = useTodoStore((s) => s.api);

    const task = cursor && graphData?.tasks[cursor] ? graphData.tasks[cursor] : null;

    // Compute if task is blocked (any dependency not calculatedCompleted)
    const isBlocked = (() => {
        if (!task || !graphData) return false;
        const childDepIds = task.children || [];
        const deps = graphData.dependencies || {};
        const tasks = graphData.tasks || {};
        for (const depId of childDepIds) {
            const dep = deps[depId];
            if (!dep) continue;
            const depTask = tasks[dep.toId];
            if (depTask && !depTask.calculatedCompleted) return true;
        }
        return false;
    })();

    const [edit, setEdit] = useState<EditState>({ field: null, value: '' });

    // Reset edit state when cursor changes
    useEffect(() => {
        setEdit({ field: null, value: '' });
    }, [cursor]);

    const startEdit = (field: EditState['field'], currentValue: string, timeValue?: string) => {
        setEdit({ field, value: currentValue, timeValue });
    };

    const cancelEdit = () => {
        setEdit({ field: null, value: '' });
    };

    const saveEdit = async () => {
        if (!api || !task || !edit.field) return;

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
                    if (edit.value) {
                        // Combine date + time (default to 23:59 if no time)
                        const time = edit.timeValue || '23:59';
                        const dateStr = `${edit.value}T${time}`;
                        update.due = Math.floor(new Date(dateStr).getTime() / 1000);
                    } else {
                        update.due = null;
                    }
                }
                await api.setTaskApiTasksTaskIdPatch({ taskId: task.id, taskUpdate: update });
            }
            setEdit({ field: null, value: '' });
        } catch (err) {
            console.error("Failed to update task:", err);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };

    // Space to toggle completion (disabled for inferred or blocked nodes)
    const canToggle = task && !task.inferred && !isBlocked;
    
    const toggleCompletion = useCallback(async () => {
        if (!task || !api || task.inferred || isBlocked) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({
                taskId: task.id,
                taskUpdate: { completed: !task.completed },
            });
        } catch (err) {
            console.error("Failed to toggle completion:", err);
        }
    }, [task, api, isBlocked]);

    const toggleInferred = useCallback(async () => {
        if (!task || !api) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({
                taskId: task.id,
                taskUpdate: { inferred: !task.inferred },
            });
        } catch (err) {
            console.error("Failed to toggle inferred:", err);
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
        return new Date(ts * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
    };

    const formatDueTimeForInput = (ts: number | null) => {
        if (!ts) return "";
        return new Date(ts * 1000).toISOString().slice(11, 16); // HH:MM
    };

    const clearDue = async () => {
        if (!api || !task) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({ taskId: task.id, taskUpdate: { due: null } });
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
                            className="bg-white/10 border border-white/30 rounded px-2 py-0.5 text-white outline-none"
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
                            className="bg-white/10 border border-white/30 rounded px-2 py-0.5 text-white outline-none"
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
            <div className="flex gap-4 text-xs">
                {/* Node type: task or inferred - click to toggle */}
                <span
                    onClick={toggleInferred}
                    className="cursor-pointer text-white/50 hover:text-white/70"
                >
                    {task.inferred ? "inferred" : "task"}
                </span>

                {/* Status: blocked > completed > actionable */}
                {isBlocked ? (
                    <span className="text-yellow-500/70">blocked</span>
                ) : (
                    <span
                        onClick={() => canToggle && toggleCompletion()}
                        className={
                            task.inferred
                                ? "text-white/30"
                                : task.calculatedCompleted
                                    ? "text-green-400 cursor-pointer hover:text-green-300"
                                    : "text-orange-400 cursor-pointer hover:text-orange-300"
                        }
                    >
                        {task.calculatedCompleted ? "completed" : "actionable"}
                    </span>
                )}

                {/* Due - displays calculatedDue (inferred), edits task.due (own) */}
                {isEditing('due') ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={edit.value as string}
                            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white text-xs outline-none"
                        />
                        <input
                            type="time"
                            value={edit.timeValue || ''}
                            onChange={(e) => setEdit({ ...edit, timeValue: e.target.value })}
                            onKeyDown={handleKeyDown}
                            placeholder="23:59"
                            className="bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white text-xs outline-none w-20"
                        />
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300">save</button>
                        <button onClick={clearDue} className="text-red-400 hover:text-red-300">clear</button>
                        <button onClick={cancelEdit} className="text-white/40 hover:text-white/60">cancel</button>
                    </div>
                ) : (
                    <span
                        onClick={() => startEdit('due', formatDueDateForInput(task.due), formatDueTimeForInput(task.due))}
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
