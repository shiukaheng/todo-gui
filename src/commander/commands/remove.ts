/**
 * Remove command - delete a task node.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const removeCommand: CommandDefinition = {
    name: 'remove',
    description: 'Delete a task node',
    aliases: ['rm', 'del', 'delete'],
    positionals: [
        {
            name: 'taskId',
            description: 'Task ID to remove (omit to remove cursor)',
            required: false,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];

                const taskIds = Object.keys(graphData.tasks);
                return taskIds.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: async (args) => {
        const { api, cursor, graphData, setCursor } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        // Use provided taskId or fall back to cursor
        const taskId = (args._[0] as string | undefined) || cursor;

        if (!taskId) {
            output.error('usage: remove <taskId> or navigate to a task first');
            return;
        }

        if (!graphData?.tasks?.[taskId]) {
            output.error(`task not found: ${taskId}`);
            return;
        }

        // Before deleting, figure out where to move cursor
        let nextCursor: string | null = null;
        if (cursor === taskId) {
            const task = graphData.tasks[taskId];
            const deps = graphData.dependencies || {};
            
            // Get parent task IDs (tasks that depend on this one)
            // parents = dep IDs where this task is toId, so parent task = dep.fromId
            const parentTaskIds = (task.parents || [])
                .map(depId => deps[depId]?.fromId)
                .filter((id): id is string => id != null);
            
            // Get child task IDs (tasks this depends on)
            // children = dep IDs where this task is fromId, so child task = dep.toId
            const childTaskIds = (task.children || [])
                .map(depId => deps[depId]?.toId)
                .filter((id): id is string => id != null);
            
            // Priority: single parent > single child > first parent > first child > null
            if (parentTaskIds.length === 1) {
                nextCursor = parentTaskIds[0];
            } else if (childTaskIds.length === 1) {
                nextCursor = childTaskIds[0];
            } else if (parentTaskIds.length > 1) {
                nextCursor = parentTaskIds[0];
            } else if (childTaskIds.length > 1) {
                nextCursor = childTaskIds[0];
            }
        }

        try {
            await api.batchOperationsApiBatchPost({
                batchRequest: {
                    operations: [{ op: 'delete_node', id: taskId }],
                },
            });
            output.success(`removed task: ${taskId}`);

            // Move cursor to next reasonable node
            if (cursor === taskId) {
                setCursor(nextCursor);
            }
        } catch (err) {
            output.error(`failed to remove task: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
