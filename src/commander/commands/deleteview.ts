/**
 * Deleteview command - delete a display view.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const deleteviewCommand: CommandDefinition = {
    name: 'deleteview',
    description: 'Delete a display view',
    aliases: ['dv'],
    positionals: [
        {
            name: 'viewId',
            description: 'ID of the view to delete',
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
            output.error('usage: deleteview <viewId>');
            return;
        }

        const { api, currentViewId, setCurrentView } = useTodoStore.getState();
        if (!api) {
            output.error('not connected to server');
            return;
        }

        try {
            await api.displayBatch({
                displayBatchRequest: {
                    operations: [{ op: 'delete_view', id: viewId }],
                },
            });
            if (currentViewId === viewId) {
                setCurrentView(null);
            }
            output.success(`deleted view: ${viewId}`);
        } catch (err) {
            output.error(`failed to delete view: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
