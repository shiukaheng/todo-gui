/**
 * Resetview command - clear all filters and hides on the current view (server-side).
 * The display SSE will push the update back, triggering graph reprocessing.
 */

import { CommandDefinition } from '../types';
import { useTodoStore, deriveViewFilters } from '../../stores/todoStore';
import { output } from '../output';

export const resetviewCommand: CommandDefinition = {
    name: 'resetview',
    description: 'Reset current view (clear filter and hidden nodes)',
    aliases: ['rv'],
    handler: () => {
        const { displayData, activeView, api } = useTodoStore.getState();
        const { filterNodeIds, hideNodeIds } = deriveViewFilters(displayData, activeView);

        if (filterNodeIds === null && (hideNodeIds === null || hideNodeIds.length === 0)) {
            output.error('view already has no filter or hidden nodes');
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
                    blacklist: [],
                } as any],
            },
        }).catch(err => {
            output.error(`failed to reset view: ${err}`);
        });

        output.success('view reset');
    },
};
