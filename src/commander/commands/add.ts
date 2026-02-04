/**
 * Add command - create a new task node.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const addCommand: CommandDefinition = {
    name: 'add',
    description: 'Create a new task node',
    aliases: ['a', 'new'],
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
        {
            name: 'depends',
            alias: 'd',
            description: 'Task IDs this task depends on (comma-separated)',
            type: 'string',
        },
        {
            name: 'blocks',
            alias: 'b',
            description: 'Task IDs this task blocks (comma-separated)',
            type: 'string',
        },
    ],
    handler: async (args) => {
        const taskId = args._[0] as string | undefined;
        if (!taskId) {
            output.error('usage: add <taskId> [--text <text>] [--completed] [--depends <ids>] [--blocks <ids>]');
            return;
        }

        const api = useTodoStore.getState().api;
        if (!api) {
            output.error('not connected to server');
            return;
        }

        const graphData = useTodoStore.getState().graphData;
        if (graphData?.tasks?.[taskId]) {
            output.error(`task already exists: ${taskId}`);
            return;
        }

        const depends = args.depends
            ? (args.depends as string).split(',').map(s => s.trim()).filter(Boolean)
            : undefined;
        const blocks = args.blocks
            ? (args.blocks as string).split(',').map(s => s.trim()).filter(Boolean)
            : undefined;

        try {
            await api.addTaskApiTasksPost({
                taskCreate: {
                    id: taskId,
                    text: args.text as string | undefined,
                    completed: args.completed as boolean,
                    depends,
                    blocks,
                },
            });
            useTodoStore.getState().setCursor(taskId);
            output.success(`created task: ${taskId}`);
        } catch (err) {
            output.error(`failed to create task: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
