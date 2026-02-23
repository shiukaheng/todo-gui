/**
 * Link command - create a dependency between two tasks.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const linkCommand: CommandDefinition = {
    name: 'link',
    description: 'Create a dependency: link <blocking> <dependent>',
    aliases: ['ln'],
    positionals: [
        {
            name: 'blockingTask',
            description: 'Task that blocks (the dependency)',
            required: true,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];

                const taskIds = Object.keys(graphData.tasks);
                return taskIds.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
        {
            name: 'dependentTask',
            description: 'Task that depends on the blocking task',
            required: true,
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
        const blockingTask = args._[0] as string | undefined;
        const dependentTask = args._[1] as string | undefined;

        if (!blockingTask || !dependentTask) {
            output.error('usage: link <blocking_task> <dependent_task>');
            return;
        }

        const { api, graphData } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        if (!graphData?.tasks?.[blockingTask]) {
            output.error(`blocking task not found: ${blockingTask}`);
            return;
        }

        if (!graphData?.tasks?.[dependentTask]) {
            output.error(`dependent task not found: ${dependentTask}`);
            return;
        }

        if (blockingTask === dependentTask) {
            output.error('cannot link a task to itself');
            return;
        }

        try {
            // API: from_id depends on to_id (from=dependent, to=blocker)
            await api.batch({
                batchRequest: {
                    operations: [{
                        op: 'link',
                        fromId: dependentTask,
                        toId: blockingTask,
                    }],
                },
            });
            output.success(`linked: ${dependentTask} now depends on ${blockingTask}`);
        } catch (err) {
            output.error(`failed to link: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
