/**
 * Clearfilter command - clear whitelist on current view (server-side).
 * The display SSE will push the update back, triggering graph reprocessing.
 */

import { CommandDefinition } from '../types';
import { useTodoStore, deriveViewFilters } from '../../stores/todoStore';
import { output } from '../output';

export const clearfilterCommand: CommandDefinition = {
    name: 'clearfilter',
    description: 'Clear the active graph filter',
    aliases: ['cf'],
    handler: () => {
        const { displayData, activeView, api } = useTodoStore.getState();
        const { filterNodeIds } = deriveViewFilters(displayData, activeView);

        if (filterNodeIds === null) {
            output.error('no filter is active');
            return;
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
                    whitelist: [],
                } as any],
            },
        }).catch(err => {
            output.error(`failed to clear filter: ${err}`);
        });

        output.success('filter cleared');
    },
};
