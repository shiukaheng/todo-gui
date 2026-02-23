/**
 * Deleteincludefilter command - remove IDs from the include-recursive filter.
 * Modifies the local filter via setFilter(); no server calls.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const deleteincludefilterCommand: CommandDefinition = {
    name: 'deleteincludefilter',
    description: 'Remove node IDs from the include-recursive filter',
    aliases: ['dif'],
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to remove (uses cursor if omitted)',
            required: false,
            complete: (partial) => {
                const filter = useTodoStore.getState().filter;
                if (!filter.includeRecursive) return [];

                return filter.includeRecursive.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const { cursor, filter, setFilter } = useTodoStore.getState();

        if (!filter.includeRecursive || filter.includeRecursive.length === 0) {
            output.error('includeRecursive filter is empty');
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

        const remaining = filter.includeRecursive.filter(id => !nodeIds.includes(id));

        setFilter({
            ...filter,
            includeRecursive: remaining.length > 0 ? remaining : null,
        });

        output.success(`includeRecursive removed: ${nodeIds.join(', ')} (remaining: ${remaining.length})`);
    },
};
