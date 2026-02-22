/**
 * Hide command - add nodes to blacklist on current view (server-side).
 * The display SSE will push the update back, triggering graph reprocessing.
 */

import { CommandDefinition } from '../types';
import { useTodoStore, deriveViewFilters } from '../../stores/todoStore';
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
        const { graphData, cursor, api, activeView, displayData } = useTodoStore.getState();

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

        if (!api) {
            output.error('not connected');
            return;
        }

        // Merge with existing hide list from server state
        const { hideNodeIds } = deriveViewFilters(displayData, activeView);
        const current = new Set(hideNodeIds || []);
        for (const id of nodeIds) {
            current.add(id);
        }
        const merged = Array.from(current);

        api.displayBatch({
            displayBatchRequest: {
                operations: [{
                    op: 'update_view',
                    view_id: activeView,
                    blacklist: merged,
                } as any],
            },
        }).catch(err => {
            output.error(`failed to persist blacklist: ${err}`);
        });

        output.success(`hidden: ${nodeIds.join(', ')}`);
    },
};
