/**
 * Flip command - flip the direction of a dependency between two tasks.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const flipCommand: CommandDefinition = {
    name: 'flip',
    description: 'Flip dependency direction: flip <taskA> <taskB>',
    aliases: ['fl'],
    positionals: [
        {
            name: 'taskA',
            description: 'First task',
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
            name: 'taskB',
            description: 'Second task',
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
        const taskA = args._[0] as string | undefined;
        const taskB = args._[1] as string | undefined;

        if (!taskA || !taskB) {
            output.error('usage: flip <taskA> <taskB>');
            return;
        }

        const { api, graphData } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        if (!graphData?.tasks?.[taskA]) {
            output.error(`task not found: ${taskA}`);
            return;
        }

        if (!graphData?.tasks?.[taskB]) {
            output.error(`task not found: ${taskB}`);
            return;
        }

        if (taskA === taskB) {
            output.error('cannot flip edge to same task');
            return;
        }

        // Check which direction the edge exists in graphData.dependencies
        // API: from_id depends on to_id (from=dependent, to=blocker)
        const deps = Object.values(graphData.dependencies || {});

        const aDependsOnB = deps.some(d => d.fromId === taskA && d.toId === taskB);
        const bDependsOnA = deps.some(d => d.fromId === taskB && d.toId === taskA);

        if (!aDependsOnB && !bDependsOnA) {
            output.error(`no dependency exists between ${taskA} and ${taskB}`);
            return;
        }

        if (aDependsOnB && bDependsOnA) {
            output.error(`bidirectional dependency exists - remove one first`);
            return;
        }

        try {
            if (aDependsOnB) {
                // A depends on B, flip to B depends on A
                await api.batch({
                    batchRequest: {
                        operations: [
                            { op: 'unlink', fromId: taskA, toId: taskB },
                            { op: 'link', fromId: taskB, toId: taskA },
                        ],
                    },
                });
                output.success(`flipped: ${taskB} now depends on ${taskA}`);
            } else {
                // B depends on A, flip to A depends on B
                await api.batch({
                    batchRequest: {
                        operations: [
                            { op: 'unlink', fromId: taskB, toId: taskA },
                            { op: 'link', fromId: taskA, toId: taskB },
                        ],
                    },
                });
                output.success(`flipped: ${taskA} now depends on ${taskB}`);
            }
        } catch (err) {
            console.error('Flip error:', err);
            output.error(`failed to flip: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
