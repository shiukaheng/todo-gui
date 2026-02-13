/**
 * Filter command - client-side filter to show only specified nodes and their recursive children.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const filterCommand: CommandDefinition = {
    name: 'filter',
    description: 'Filter graph to show only specified nodes and their children',
    aliases: ['f'],
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to filter on (uses cursor if omitted)',
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
        const { graphData, cursor, setFilter } = useTodoStore.getState();

        if (!graphData?.tasks) {
            output.error('no graph data available');
            return;
        }

        // Collect node IDs: all positional args, or cursor if none provided
        let nodeIds = args._ as string[];

        if (nodeIds.length === 0) {
            if (!cursor) {
                output.error('no nodes specified and no cursor set');
                return;
            }
            nodeIds = [cursor];
        }

        // Validate all node IDs exist
        for (const id of nodeIds) {
            if (!graphData.tasks[id]) {
                output.error(`node not found: ${id}`);
                return;
            }
        }

        setFilter(nodeIds);
        output.success(`filter active: ${nodeIds.join(', ')}`);
    },
};
