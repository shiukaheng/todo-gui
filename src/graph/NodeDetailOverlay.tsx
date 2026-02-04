import { useState, useEffect, useCallback } from "react";
import { TaskOut } from "todo-client";
import { useTodoStore } from "../stores/todoStore";

interface EditState {
    field: 'text' | 'completed' | 'due' | null;
    value: string | boolean;
}

export function NodeDetailOverlay() {
    const cursor = useTodoStore((s) => s.cursor);
    const graphData = useTodoStore((s) => s.graphData);
    const api = useTodoStore((s) => s.api);

    const task = cursor && graphData?.tasks[cursor] ? graphData.tasks[cursor] : null;

    const [edit, setEdit] = useState<EditState>({ field: null, value: '' });

    // Reset edit state when cursor changes
    useEffect(() => {
        setEdit({ field: null, value: '' });
    }, [cursor]);

    const startEdit = (field: EditState['field'], currentValue: string | boolean) => {
        if (field === 'completed' && task?.inferred) return;
        setEdit({ field, value: currentValue });
    };

    const cancelEdit = () => {
        setEdit({ field: null, value: '' });
    };

    const saveEdit = async () => {
        if (!api || !task || !edit.field) return;

        try {
            const update: Record<string, any> = {};
            if (edit.field === 'text') {
                update.text = edit.value as string;
            } else if (edit.field === 'completed') {
                update.completed = edit.value as boolean;
            } else if (edit.field === 'due') {
                const dateStr = edit.value as string;
                update.due = dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : null;
            }

            await api.setTaskApiTasksTaskIdPatch({ taskId: task.id, taskUpdate: update });
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

    // Space to toggle completion
    const toggleCompletion = useCallback(async () => {
        if (!task || !api || task.inferred) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({
                taskId: task.id,
                taskUpdate: { completed: !task.completed },
            });
        } catch (err) {
            console.error("Failed to toggle completion:", err);
        }
    }, [task, api]);

    // Global keyboard handler for space
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === ' ' && task && !task.inferred) {
                e.preventDefault();
                toggleCompletion();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [task, toggleCompletion]);

    if (!task) return null;

    const formatDate = (ts: number | null) => {
        if (!ts) return "-";
        return new Date(ts * 1000).toLocaleString();
    };

    const formatDueForInput = (ts: number | null) => {
        if (!ts) return "";
        return new Date(ts * 1000).toISOString().slice(0, 16);
    };

    const isEditing = (field: EditState['field']) => edit.field === field;

    return (
        <div className="absolute top-4 left-4 text-white/80 font-mono text-sm select-none">
            {/* ID */}
            <div className="text-white/40 text-xs mb-1">{task.id}</div>

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
            <div className="flex gap-4 text-xs text-white/50">
                {/* Completed */}
                {isEditing('completed') ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={edit.value as boolean}
                            onChange={(e) => setEdit({ ...edit, value: e.target.checked })}
                            className="w-3 h-3"
                        />
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300">save</button>
                        <button onClick={cancelEdit} className="text-white/40 hover:text-white/60">cancel</button>
                    </div>
                ) : (
                    <span
                        onClick={() => !task.inferred && startEdit('completed', task.completed)}
                        className={task.inferred ? "text-white/30" : "cursor-pointer hover:text-white"}
                    >
                        {task.completed ? "completed" : "incomplete"}
                        {task.inferred && " (inferred)"}
                    </span>
                )}

                {/* Due */}
                {isEditing('due') ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="datetime-local"
                            value={edit.value as string}
                            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white text-xs outline-none"
                        />
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300">save</button>
                        <button onClick={cancelEdit} className="text-white/40 hover:text-white/60">cancel</button>
                    </div>
                ) : (
                    <span
                        onClick={() => startEdit('due', formatDueForInput(task.due))}
                        className="cursor-pointer hover:text-white"
                    >
                        due: {task.due ? formatDate(task.due) : "-"}
                    </span>
                )}
            </div>

            {/* Read-only info */}
            <div className="mt-2 text-xs text-white/30">
                {task.depsClear === false && <span className="text-yellow-500/70">blocked</span>}
                {task.calculatedCompleted && <span className="text-green-500/70 ml-2">done</span>}
            </div>
        </div>
    );
}
