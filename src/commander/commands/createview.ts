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
    handler: async (args) => {
        const viewId = args._[0] as string | undefined;
        if (!viewId) {
            output.error('usage: createview <viewId>');
            return;
        }

        const api = useTodoStore.getState().api;
        if (!api) {
            output.error('not connected to server');
            return;
        }

        try {
            await api.displayBatch({
                displayBatchRequest: {
                    operations: [{ op: 'create_view', id: viewId }],
                },
            });
            useTodoStore.getState().setCurrentView(viewId);
            output.success(`created view: ${viewId}`);
        } catch (err) {
            output.error(`failed to create view: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
