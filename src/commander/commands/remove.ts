/**
 * Delete command - delete a task node.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const removeCommand: CommandDefinition = {
    name: 'delete',
    description: 'Delete a task node',
    aliases: ['rm', 'remove'],
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
    options: [
        {
            name: 'recursive',
            alias: 'r',
            description: 'Delete node and all its recursive children',
            type: 'boolean',
            default: false,
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

        const recursive = !!args.recursive;
        const deps = graphData.dependencies || {};

        // Collect IDs to delete
        let deleteIds: string[];
        if (recursive) {
            const visited = new Set<string>();
            const stack = [taskId];
            while (stack.length > 0) {
                const id = stack.pop()!;
                if (visited.has(id)) continue;
                visited.add(id);
                const node = graphData.tasks[id];
                if (!node) continue;
                // children = dep IDs where this node is fromId, child task = dep.toId
                const childTaskIds = (node.children || [])
                    .map(depId => deps[depId]?.toId)
                    .filter((id): id is string => id != null);
                for (const childId of childTaskIds) {
                    if (!visited.has(childId)) stack.push(childId);
                }
            }
            deleteIds = Array.from(visited);
        } else {
            deleteIds = [taskId];
        }

        const deleteSet = new Set(deleteIds);

        // Before deleting, figure out where to move cursor
        let nextCursor: string | null = null;
        if (cursor && deleteSet.has(cursor)) {
            const task = graphData.tasks[taskId];

            // Get parent task IDs (tasks that depend on this one)
            // parents = dep IDs where this task is toId, so parent task = dep.fromId
            const parentTaskIds = (task.parents || [])
                .map(depId => deps[depId]?.fromId)
                .filter((id): id is string => id != null && !deleteSet.has(id));

            // Get child task IDs (tasks this depends on)
            // children = dep IDs where this task is fromId, so child task = dep.toId
            const childTaskIds = (task.children || [])
                .map(depId => deps[depId]?.toId)
                .filter((id): id is string => id != null && !deleteSet.has(id));

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
            const operations = deleteIds.map(id => ({ op: 'delete_node' as const, id }));
            await api.batchOperationsApiBatchPost({
                batchRequest: { operations },
            });
            if (recursive && deleteIds.length > 1) {
                output.success(`removed task ${taskId} and ${deleteIds.length - 1} descendant(s)`);
            } else {
                output.success(`removed task: ${taskId}`);
            }

            // Move cursor to next reasonable node
            if (cursor && deleteSet.has(cursor)) {
                setCursor(nextCursor);
            }
        } catch (err) {
            output.error(`failed to remove task: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
