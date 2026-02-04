/**
 * Echo command - demonstrates basic command with options.
 */

import { CommandDefinition } from '../types';
import { output } from '../output';

export const echoCommand: CommandDefinition = {
    name: 'echo',
    description: 'Echo back the provided message',
    aliases: ['say'],
    positionals: [
        {
            name: 'message',
            description: 'Message to echo',
            required: true,
        },
    ],
    options: [
        {
            name: 'uppercase',
            alias: 'u',
            description: 'Convert to uppercase',
            type: 'boolean',
            default: false,
        },
        {
            name: 'repeat',
            alias: 'r',
            description: 'Number of times to repeat',
            type: 'number',
            default: 1,
        },
    ],
    handler: (args) => {
        let message = args._.join(' ') || '';
        if (args.uppercase) {
            message = message.toUpperCase();
        }
        const count = typeof args.repeat === 'number' ? args.repeat : 1;
        for (let i = 0; i < count; i++) {
            output.print(message);
        }
    },
};
