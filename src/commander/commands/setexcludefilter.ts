/**
 * Setexcludefilter command - replace the exclude-recursive filter with specified IDs.
 * Modifies the local filter via setFilter(); no server calls.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const setexcludefilterCommand: CommandDefinition = {
    name: 'setexcludefilter',
    description: 'Set exclude-recursive filter to specified node IDs',
    aliases: ['sef'],
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to exclude recursively (uses cursor if omitted)',
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
    handler: (args) => {
        const { graphData, cursor, filter, setFilter } = useTodoStore.getState();

        if (!graphData?.tasks) {
            output.error('no graph data available');
            return;
        }

        let nodeIds = args._ as string[];

        if (nodeIds.length === 0) {
            if (!cursor) {
                output.error('no nodes specified and no cursor set');
                return;
            }
            nodeIds = [cursor];
        }

        for (const id of nodeIds) {
            if (!graphData.tasks[id]) {
                output.error(`node not found: ${id}`);
                return;
            }
        }

        setFilter({ ...filter, excludeRecursive: nodeIds });
        output.success(`excludeRecursive set: ${nodeIds.join(', ')}`);
    },
};
