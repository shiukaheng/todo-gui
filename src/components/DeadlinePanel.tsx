import { useTodoStore } from "../stores/todoStore";
import { getUrgencyColorCSSFromTimestamp } from "../utils/urgencyColor";
import { formatDistanceToNow } from "date-fns";

export function DeadlinePanel() {
    const graphData = useTodoStore((s) => s.graphData);
    const cursor = useTodoStore((s) => s.cursor);
    const setCursor = useTodoStore((s) => s.setCursor);

    if (!graphData?.tasks) return null;

    // Get tasks with deadlines, sorted by urgency (earliest first)
    const tasksWithDeadlines = Object.entries(graphData.tasks)
        .filter(([_, task]) => task.calculatedDue && !task.calculatedCompleted)
        .map(([id, task]) => ({
            id,
            calculatedDue: task.calculatedDue!,
        }))
        .sort((a, b) => a.calculatedDue - b.calculatedDue);

    if (tasksWithDeadlines.length === 0) return null;

    return (
        <div className="text-sm font-mono space-y-1">
            {tasksWithDeadlines.map(({ id, calculatedDue }) => {
                const isCursor = id === cursor;
                const urgencyColor = getUrgencyColorCSSFromTimestamp(calculatedDue);
                const relative = formatDistanceToNow(new Date(calculatedDue * 1000), { addSuffix: true });
                
                return (
                    <div
                        key={id}
                        onClick={() => setCursor(id)}
                        className="cursor-pointer text-right"
                        style={{ color: isCursor ? 'white' : 'rgba(255,255,255,0.4)' }}
                    >
                        <span style={{ color: isCursor ? urgencyColor : undefined }}>{relative}</span>
                        {' '}
                        <span>{id}</span>
                    </div>
                );
            })}
        </div>
    );
}
