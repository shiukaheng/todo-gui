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

        // Check which direction the edge exists
        // parents = tasks this task depends on (blockers)
        // children = tasks that depend on this task
        const taskAData = graphData.tasks[taskA];
        const taskBData = graphData.tasks[taskB];
        const aBlocksB = taskBData.parents?.includes(taskA);
        const bBlocksA = taskAData.parents?.includes(taskB);

        if (!aBlocksB && !bBlocksA) {
            output.error(`no dependency exists between ${taskA} and ${taskB}`);
            return;
        }

        if (aBlocksB && bBlocksA) {
            output.error(`bidirectional dependency exists - remove one first`);
            return;
        }

        try {
            if (aBlocksB) {
                // A blocks B, flip to B blocks A
                await api.unlinkTasksApiLinksDelete({
                    linkRequest: { from: taskA, to: taskB },
                });
                await api.linkTasksApiLinksPost({
                    linkRequest: { from: taskB, to: taskA },
                });
                output.success(`flipped: ${taskA} now depends on ${taskB}`);
            } else {
                // B blocks A, flip to A blocks B
                await api.unlinkTasksApiLinksDelete({
                    linkRequest: { from: taskB, to: taskA },
                });
                await api.linkTasksApiLinksPost({
                    linkRequest: { from: taskA, to: taskB },
                });
                output.success(`flipped: ${taskB} now depends on ${taskA}`);
            }
        } catch (err) {
            output.error(`failed to flip: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
