/**
 * Deleteexcludefilter command - remove IDs from the exclude-recursive filter.
 * Modifies the local filter via setFilter(); no server calls.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const deleteexcludefilterCommand: CommandDefinition = {
    name: 'deleteexcludefilter',
    description: 'Remove node IDs from the exclude-recursive filter',
    aliases: ['def'],
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to remove (uses cursor if omitted)',
            required: false,
            complete: (partial) => {
                const filter = useTodoStore.getState().filter;
                if (!filter.excludeRecursive) return [];

                return filter.excludeRecursive.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const { cursor, filter, setFilter } = useTodoStore.getState();

        if (!filter.excludeRecursive || filter.excludeRecursive.length === 0) {
            output.error('excludeRecursive filter is empty');
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

        const remaining = filter.excludeRecursive.filter(id => !nodeIds.includes(id));

        setFilter({
            ...filter,
            excludeRecursive: remaining.length > 0 ? remaining : null,
        });

        output.success(`excludeRecursive removed: ${nodeIds.join(', ')} (remaining: ${remaining.length})`);
    },
};
