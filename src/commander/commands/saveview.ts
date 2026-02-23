/**
 * Saveview command - save current local filter to a named server view.
 * Persists positions and filter fields to the backend.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const saveviewCommand: CommandDefinition = {
    name: 'saveview',
    description: 'Save current filter and positions to a named view',
    aliases: ['sv'],
    positionals: [
        {
            name: 'name',
            description: 'Name of the view to save',
            required: true,
            complete: (partial) => {
                const viewsData = useTodoStore.getState().viewsData;
                if (!viewsData?.views) return [];
                return Object.keys(viewsData.views).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: async (args) => {
        const name = args._[0] as string | undefined;

        if (!name) {
            output.error('usage: saveview <name>');
            return;
        }

        const { api, filter, savePositionsCallback } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        // Persist current positions to the named view
        if (savePositionsCallback) {
            savePositionsCallback(name);
        }

        const op: any = {
            op: 'update_view',
            viewId: name,
            includeRecursive: filter.includeRecursive ?? [],
            excludeRecursive: filter.excludeRecursive ?? [],
            hideCompletedFor: filter.hideCompletedFor,
        };

        try {
            await api.displayBatch({
                displayBatchRequest: {
                    operations: [op],
                },
            });
            output.success(`saved view: ${name}`);
        } catch (err) {
            output.error(`failed to save view: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
