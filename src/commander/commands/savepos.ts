/**
 * Savepos command - manually save current node positions to the server.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const saveposCommand: CommandDefinition = {
    name: 'savepos',
    description: 'Save current node positions to the server',
    aliases: ['sp'],
    handler: () => {
        const { savePositionsCallback } = useTodoStore.getState();
        if (!savePositionsCallback) {
            output.print('No graph engine active');
            return;
        }
        savePositionsCallback();
        output.print('Saving positions');
    },
};
