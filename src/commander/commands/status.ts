/**
 * Status command - shows server connection status.
 */

import { CommandDefinition } from '../types';
import { output } from '../output';
import { useTodoStore } from '../../stores/todoStore';

export const statusCommand: CommandDefinition = {
    name: 'status',
    description: 'Show server connection status',
    aliases: ['st'],
    handler: () => {
        const { connectionStatus, baseUrl, lastError, lastDataReceived, graphData } = useTodoStore.getState();

        output.print(`Connection: ${connectionStatus}`);

        if (baseUrl) {
            output.print(`Server: ${baseUrl}`);
        }

        if (connectionStatus === 'connected' && lastDataReceived) {
            const ago = Math.round((Date.now() - lastDataReceived) / 1000);
            output.print(`Last data: ${ago}s ago`);
        }

        if (graphData) {
            const taskCount = Object.keys(graphData.tasks || {}).length;
            const depCount = Object.keys(graphData.dependencies || {}).length;
            output.print(`Tasks: ${taskCount}, Dependencies: ${depCount}`);
        }

        if (lastError) {
            output.error(`Error: ${lastError}`);
        }
    },
};
