/**
 * Hide command - hide specific nodes from the graph (blacklist).
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const hideCommand: CommandDefinition = {
    name: 'hide',
    description: 'Hide specific nodes from the graph',
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to hide (uses cursor if omitted)',
            required: false,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];
                return Object.keys(graphData.tasks).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const { graphData, cursor, blacklistNodeIds, setBlacklist } = useTodoStore.getState();

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

        // Validate all node IDs exist
        for (const id of nodeIds) {
            if (!graphData.tasks[id]) {
                output.error(`node not found: ${id}`);
                return;
            }
        }

        // Merge with existing blacklist
        const current = new Set(blacklistNodeIds || []);
        for (const id of nodeIds) {
            current.add(id);
        }
        const merged = Array.from(current);

        setBlacklist(merged);

        // Persist blacklist to current view (upserts view if needed)
        const { api, currentViewId } = useTodoStore.getState();
        if (api) {
            api.displayBatch({
                displayBatchRequest: {
                    operations: [{
                        op: 'update_view',
                        viewId: currentViewId,
                        blacklist: merged,
                    }],
                },
            }).catch(err => {
                console.error('Failed to persist blacklist:', err);
            });
        }

        output.success(`hidden: ${nodeIds.join(', ')}`);
    },
};
