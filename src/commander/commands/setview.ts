/**
 * Setview command - switch to a view, creating it if missing.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const setviewCommand: CommandDefinition = {
    name: 'setview',
    description: 'Set active display view (creates it if missing)',
    aliases: ['sv'],
    positionals: [
        {
            name: 'viewId',
            description: 'ID of the view to use',
            required: true,
            complete: (partial) => {
                const displayData = useTodoStore.getState().displayData;
                if (!displayData?.views) return [];
                return Object.keys(displayData.views).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: async (args) => {
        const viewId = args._[0] as string | undefined;
        if (!viewId) {
            output.error('usage: setview <viewId>');
            return;
        }

        const { api, displayData, switchView } = useTodoStore.getState();
        if (!api) {
            output.error('not connected to server');
            return;
        }

        const exists = !!displayData?.views?.[viewId];

        try {
            if (!exists) {
                await api.displayBatch({
                    displayBatchRequest: {
                        operations: [{ op: 'update_view', view_id: viewId } as any],
                    },
                });
            }

            switchView(viewId);
            output.success(`${exists ? 'switched to' : 'created and switched to'} view: ${viewId}`);
        } catch (err) {
            output.error(`failed to set view: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
