/**
 * Addexcludefilter command - append IDs to the exclude-recursive filter.
 * Modifies the local filter via setFilter(); no server calls.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const addexcludefilterCommand: CommandDefinition = {
    name: 'addexcludefilter',
    description: 'Add node IDs to the exclude-recursive filter',
    aliases: ['aef'],
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to add (uses cursor if omitted)',
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

        const existing = filter.excludeRecursive ?? [];
        const merged = [...new Set([...existing, ...nodeIds])];

        setFilter({ ...filter, excludeRecursive: merged });
        output.success(`excludeRecursive added: ${nodeIds.join(', ')} (total: ${merged.length})`);
    },
};
