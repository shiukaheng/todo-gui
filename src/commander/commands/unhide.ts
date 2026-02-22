/**
 * Unhide command - remove nodes from blacklist on current view (server-side).
 * The display SSE will push the update back, triggering graph reprocessing.
 */

import { CommandDefinition } from '../types';
import { useTodoStore, deriveViewFilters } from '../../stores/todoStore';
import { output } from '../output';

export const unhideCommand: CommandDefinition = {
    name: 'unhide',
    description: 'Unhide nodes (or all if no args)',
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to unhide (clears all if omitted)',
            required: false,
            complete: (partial) => {
                const { displayData, activeView } = useTodoStore.getState();
                const { hideNodeIds } = deriveViewFilters(displayData, activeView);
                if (!hideNodeIds) return [];
                return hideNodeIds.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const { api, activeView, displayData } = useTodoStore.getState();
        const { hideNodeIds } = deriveViewFilters(displayData, activeView);

        if (!hideNodeIds || hideNodeIds.length === 0) {
            output.error('no nodes are hidden');
            return;
        }

        if (!api) {
            output.error('not connected');
            return;
        }

        const nodeIds = args._ as string[];

        let newHideList: string[];
        if (nodeIds.length === 0) {
            newHideList = [];
        } else {
            const toRemove = new Set(nodeIds);
            newHideList = hideNodeIds.filter(id => !toRemove.has(id));
        }

        api.displayBatch({
            displayBatchRequest: {
                operations: [{
                    op: 'update_view',
                    view_id: activeView,
                    blacklist: newHideList,
                } as any],
            },
        }).catch(err => {
            output.error(`failed to persist blacklist: ${err}`);
        });

        if (nodeIds.length === 0) {
            output.success('all nodes unhidden');
        } else {
            output.success(`unhidden: ${nodeIds.join(', ')}`);
        }
    },
};
