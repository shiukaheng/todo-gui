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

        try {
            await api.removeTaskApiTasksTaskIdDelete({ taskId });
            output.success(`removed task: ${taskId}`);

            // Clear cursor if we removed the cursor node
            if (cursor === taskId) {
                setCursor(null);
            }
        } catch (err) {
            output.error(`failed to remove task: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
