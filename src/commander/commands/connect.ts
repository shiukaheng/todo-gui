/**
 * Connect command - connect or reconnect to server.
 */

import { CommandDefinition } from '../types';
import { output } from '../output';
import { useTodoStore } from '../../stores/todoStore';

const DEFAULT_URL = 'http://workstation.local:8000';

export const connectCommand: CommandDefinition = {
    name: 'connect',
    description: 'Connect to server (reconnects if already connected)',
    aliases: ['conn', 'reconnect'],
    positionals: [
        {
            name: 'url',
            description: `Server URL (default: ${DEFAULT_URL})`,
            required: false,
        },
    ],
    handler: (args) => {
        const url = args._[0] as string || useTodoStore.getState().baseUrl || DEFAULT_URL;

        output.print(`Connecting to ${url}...`);
        useTodoStore.getState().subscribe(url);
        output.success('Connection initiated');
    },
};

export const disconnectCommand: CommandDefinition = {
    name: 'disconnect',
    description: 'Disconnect from server',
    aliases: ['disc'],
    handler: () => {
        const { connectionStatus } = useTodoStore.getState();

        if (connectionStatus === 'disconnected') {
            output.print('Already disconnected');
            return;
        }

        useTodoStore.getState().disconnect();
        output.success('Disconnected');
    },
};
