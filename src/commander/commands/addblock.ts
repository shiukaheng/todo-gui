/**
 * Addblock command - create a new task that depends on the cursor node (add a child).
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const addblockCommand: CommandDefinition = {
    name: 'addblock',
    description: 'Add a task that the cursor blocks (a child/dependent)',
    aliases: ['ab'],
    positionals: [
        {
            name: 'taskId',
            description: 'ID for the new task',
            required: true,
        },
    ],
    options: [
        {
            name: 'text',
            alias: 't',
            description: 'Task description text',
            type: 'string',
        },
        {
            name: 'completed',
            alias: 'c',
            description: 'Mark task as completed',
            type: 'boolean',
            default: false,
        },
    ],
    handler: async (args) => {
        const taskId = args._[0] as string | undefined;
        if (!taskId) {
            output.error('usage: addblock <taskId> [--text <text>] [--completed]');
            return;
        }

        const { api, cursor, graphData } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        if (!cursor) {
            output.error('no cursor selected - navigate to a task first');
            return;
        }

        if (graphData?.tasks?.[taskId]) {
            output.error(`task already exists: ${taskId}`);
            return;
        }

        try {
            // Create a new task that depends on the cursor (cursor blocks new task)
            useTodoStore.getState().queueCursor(taskId);
            await api.batchOperationsApiBatchPost({
                batchRequest: {
                    operations: [{
                        op: 'create_node',
                        id: taskId,
                        text: args.text as string | undefined,
                        completed: args.completed ? { value: true, modified: Math.floor(Date.now() / 1000) } : undefined,
                        depends: [cursor],
                    }],
                },
            });
            output.success(`created task: ${taskId} (depends on ${cursor})`);
        } catch (err) {
            output.error(`failed to create task: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
