/**
 * Filter command - set whitelist on current view (server-side).
 * The display SSE will push the update back, triggering graph reprocessing.
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
        const { graphData, cursor, api, activeView } = useTodoStore.getState();

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

        api.displayBatch({
            displayBatchRequest: {
                operations: [{
                    op: 'update_view',
                    view_id: activeView,
                    whitelist: nodeIds,
                } as any],
            },
        }).catch(err => {
            output.error(`failed to set filter: ${err}`);
        });

        output.success(`filter: ${nodeIds.join(', ')}`);
    },
};
