/**
 * Addincludefilter command - append IDs to the include-recursive filter.
 * Modifies the local filter via setFilter(); no server calls.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const addincludefilterCommand: CommandDefinition = {
    name: 'addincludefilter',
    description: 'Add node IDs to the include-recursive filter',
    aliases: ['aif'],
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

        const existing = filter.includeRecursive ?? [];
        const merged = [...new Set([...existing, ...nodeIds])];

        setFilter({ ...filter, includeRecursive: merged });
        output.success(`includeRecursive added: ${nodeIds.join(', ')} (total: ${merged.length})`);
    },
};
