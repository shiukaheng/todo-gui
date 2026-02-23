/**
 * Savepos command - save current node positions locally or to a named server view.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const saveposCommand: CommandDefinition = {
    name: 'savepos',
    description: 'Save current node positions (local or to a named view)',
    aliases: ['sp'],
    positionals: [
        {
            name: 'view',
            description: 'View name to save positions to (omit for local save)',
            required: false,
            complete: (partial) => {
                const viewsData = useTodoStore.getState().viewsData;
                if (!viewsData?.views) return [];
                return Object.keys(viewsData.views).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const viewId = args._[0] as string | undefined;

        if (viewId) {
            // Named view → server save
            const { savePositionsCallback } = useTodoStore.getState();
            if (!savePositionsCallback) {
                output.print('No graph engine active');
                return;
            }
            savePositionsCallback(viewId);
            output.print(`Saving positions to view '${viewId}'`);
        } else {
            // No args → force local save
            const { saveLocalPositionsCallback } = useTodoStore.getState();
            if (!saveLocalPositionsCallback) {
                output.print('No graph engine active');
                return;
            }
            saveLocalPositionsCallback();
            output.print('Positions saved locally');
        }
    },
};
