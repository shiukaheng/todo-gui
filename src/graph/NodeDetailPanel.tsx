import { useState, useEffect } from "react";
import { TaskOut } from "todo-client";
import { useTodoStore } from "../stores/todoStore";

interface NodeDetailPanelProps {
    task: TaskOut;
}

export function NodeDetailPanel({ task }: NodeDetailPanelProps) {
    const api = useTodoStore((s) => s.api);

    // Local edit state
    const [text, setText] = useState(task.text);
    const [completed, setCompleted] = useState(task.completed);
    const [inferred, setInferred] = useState(task.inferred);
    const [due, setDue] = useState<string>(task.due ? new Date(task.due * 1000).toISOString().slice(0, 16) : "");
    const [isDirty, setIsDirty] = useState(false);

    // Reset local state when task changes
    useEffect(() => {
        setText(task.text);
        setCompleted(task.completed);
        setInferred(task.inferred);
        setDue(task.due ? new Date(task.due * 1000).toISOString().slice(0, 16) : "");
        setIsDirty(false);
    }, [task.id, task.text, task.completed, task.inferred, task.due]);

    const handleChange = <T,>(setter: (v: T) => void) => (value: T) => {
        setter(value);
        setIsDirty(true);
    };

    const handleSave = async () => {
        if (!api) return;
        try {
            await api.setTaskApiTasksTaskIdPatch({
                taskId: task.id,
                taskUpdate: {
                    text: text !== task.text ? text : undefined,
                    completed: completed !== task.completed ? completed : undefined,
                    inferred: inferred !== task.inferred ? inferred : undefined,
                    due: due ? Math.floor(new Date(due).getTime() / 1000) : null,
                },
            });
            setIsDirty(false);
        } catch (err) {
            console.error("Failed to update task:", err);
        }
    };

    const handleCancel = () => {
        setText(task.text);
        setCompleted(task.completed);
        setInferred(task.inferred);
        setDue(task.due ? new Date(task.due * 1000).toISOString().slice(0, 16) : "");
        setIsDirty(false);
    };

    const formatTimestamp = (ts: number | null) => {
        if (!ts) return "-";
        return new Date(ts * 1000).toLocaleString();
    };

    return (
        <div className="absolute top-4 left-4 bg-gray-900/95 text-white p-4 rounded-lg shadow-lg min-w-[300px] max-w-[400px] font-mono text-sm">
            <div className="text-xs text-gray-400 mb-2">ID: {task.id}</div>

            {/* Text */}
            <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1">Text</label>
                <input
                    type="text"
                    value={text}
                    onChange={(e) => handleChange(setText)(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                />
            </div>

            {/* Completed */}
            <div className="mb-3 flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={completed}
                    onChange={(e) => handleChange(setCompleted)(e.target.checked)}
                    disabled={inferred}
                    className="w-4 h-4"
                />
                <label className="text-xs text-gray-400">
                    Completed {inferred && "(disabled - inferred node)"}
                </label>
            </div>

            {/* Inferred */}
            <div className="mb-3 flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={inferred}
                    onChange={(e) => handleChange(setInferred)(e.target.checked)}
                    className="w-4 h-4"
                />
                <label className="text-xs text-gray-400">Inferred (AND gate)</label>
            </div>

            {/* Due */}
            <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1">Due</label>
                <input
                    type="datetime-local"
                    value={due}
                    onChange={(e) => handleChange(setDue)(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                />
            </div>

            {/* Read-only computed fields */}
            <div className="border-t border-gray-700 pt-3 mt-3 text-xs text-gray-500">
                <div>Calculated Completed: {task.calculatedCompleted ? "Yes" : "No"}</div>
                <div>Deps Clear: {task.depsClear ? "Yes" : "No"}</div>
                <div>Created: {formatTimestamp(task.createdAt)}</div>
                <div>Updated: {formatTimestamp(task.updatedAt)}</div>
                <div>Parents: {task.parents.length > 0 ? task.parents.join(", ") : "-"}</div>
                <div>Children: {task.children.length > 0 ? task.children.join(", ") : "-"}</div>
            </div>

            {/* Action buttons */}
            {isDirty && (
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={handleSave}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                    >
                        Save
                    </button>
                    <button
                        onClick={handleCancel}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}
