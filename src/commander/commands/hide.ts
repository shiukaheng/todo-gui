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
        const { graphData, cursor, hideNodeIds, setHide } = useTodoStore.getState();

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

        // Merge with existing hide list
        const current = new Set(hideNodeIds || []);
        for (const id of nodeIds) {
            current.add(id);
        }
        const merged = Array.from(current);

        setHide(merged);

        // Persist hide list to current view (upserts view if needed)
        const { api, activeView } = useTodoStore.getState();
        if (api) {
            api.displayBatch({
                displayBatchRequest: {
                    operations: [{
                        op: 'update_view',
                        view_id: activeView,
                        blacklist: merged,
                    } as any],
                },
            }).catch(err => {
                console.error('Failed to persist blacklist:', err);
            });
        }

        output.success(`hidden: ${nodeIds.join(', ')}`);
    },
};
