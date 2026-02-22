/**
 * Createview command - create a new display view.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const createviewCommand: CommandDefinition = {
    name: 'createview',
    description: 'Create a new display view',
    aliases: ['cv'],
    positionals: [
        {
            name: 'viewId',
            description: 'ID for the new view',
            required: true,
        },
    ],
    options: [
        {
            name: 'fork',
            alias: 'f',
            description: 'Fork from existing view (copies positions, whitelist, blacklist)',
            type: 'string',
        },
    ],
    handler: async (args) => {
        const viewId = args._[0] as string | undefined;
        if (!viewId) {
            output.error('usage: createview <viewId>');
            return;
        }

        const { api, displayData, switchView } = useTodoStore.getState();
        if (!api) {
            output.error('not connected to server');
            return;
        }

        const forkFrom = args.fork as string | undefined;

        try {
            if (forkFrom) {
                const sourceView = displayData?.views?.[forkFrom];
                if (!sourceView) {
                    output.error(`source view not found: ${forkFrom}`);
                    return;
                }
                // Upsert new view with source's data
                await api.displayBatch({
                    displayBatchRequest: {
                        operations: [{
                            op: 'update_view',
                            view_id: viewId,
                            positions: sourceView.positions,
                            whitelist: sourceView.whitelist,
                            blacklist: sourceView.blacklist,
                        } as any],
                    },
                });
            } else {
                // Upsert empty view
                await api.displayBatch({
                    displayBatchRequest: {
                        operations: [{ op: 'update_view', view_id: viewId } as any],
                    },
                });
            }

            switchView(viewId);
            output.success(`created view: ${viewId}${forkFrom ? ` (forked from ${forkFrom})` : ''}`);
        } catch (err) {
            output.error(`failed to create view: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
