import { useState, useEffect, useCallback } from "react";
import { useTodoStore } from "../stores/todoStore";

interface EditState {
    field: 'id' | 'text' | 'due' | null;
    value: string;
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

    const startEdit = (field: EditState['field'], currentValue: string) => {
        setEdit({ field, value: currentValue });
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
                    update.due = edit.value ? Math.floor(new Date(edit.value).getTime() / 1000) : null;
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
                {/* Completed - click to toggle */}
                <span
                    onClick={() => !task.inferred && toggleCompletion()}
                    className={
                        task.inferred
                            ? "text-white/30"
                            : task.completed
                                ? "text-green-400 cursor-pointer hover:text-green-300"
                                : "text-orange-400 cursor-pointer hover:text-orange-300"
                    }
                >
                    {task.completed ? "completed" : "incomplete"}
                    {task.inferred && " (inferred)"}
                </span>

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
            {task.depsClear === false && (
                <div className="mt-2 text-xs text-yellow-500/70">blocked</div>
            )}
        </div>
    );
}
