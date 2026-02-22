/**
 * Clearfilter command - remove client-side graph filter and restore positions.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const clearfilterCommand: CommandDefinition = {
    name: 'clearfilter',
    description: 'Clear the active graph filter and restore positions',
    aliases: ['cf'],
    handler: () => {
        const { filterNodeIds, clearFilter } = useTodoStore.getState();

        if (filterNodeIds === null) {
            output.error('no filter is active');
            return;
        }

        clearFilter();

        // Clear whitelist on server (upserts view if needed)
        const { api, currentViewId } = useTodoStore.getState();
        if (api) {
            api.displayBatch({
                displayBatchRequest: {
                    operations: [{
                        op: 'update_view',
                        view_id: currentViewId,
                        whitelist: [],
                    } as any],
                },
            }).catch(err => {
                console.error('Failed to clear whitelist:', err);
            });
        }

        output.success('filter cleared');
    },
};
