/**
 * Help command - shows available commands.
 */

import { CommandDefinition } from '../types';
import { commandRegistry } from '../CommandRegistry';

export const helpCommand: CommandDefinition = {
    name: 'help',
    description: 'Show available commands or help for a specific command',
    aliases: ['?'],
    positionals: [
        {
            name: 'command',
            description: 'Command to get help for',
            required: false,
            complete: (partial) => {
                return commandRegistry.getAll()
                    .map(cmd => cmd.name)
                    .filter(name => name.startsWith(partial));
            },
        },
    ],
    handler: (args) => {
        const cmdName = args._[0] as string | undefined;

        if (cmdName) {
            const cmd = commandRegistry.get(cmdName);
            if (!cmd) {
                console.log(`Unknown command: ${cmdName}`);
                return;
            }

            console.log(`${cmd.name} - ${cmd.description}`);
            if (cmd.aliases?.length) {
                console.log(`  Aliases: ${cmd.aliases.join(', ')}`);
            }
            if (cmd.positionals?.length) {
                console.log('  Arguments:');
                for (const pos of cmd.positionals) {
                    const req = pos.required ? ' (required)' : '';
                    console.log(`    <${pos.name}>${req} - ${pos.description}`);
                }
            }
            if (cmd.options?.length) {
                console.log('  Options:');
                for (const opt of cmd.options) {
                    const alias = opt.alias ? `, -${opt.alias}` : '';
                    console.log(`    --${opt.name}${alias} - ${opt.description}`);
                }
            }
        } else {
            console.log('Available commands:');
            for (const cmd of commandRegistry.getAll()) {
                console.log(`  ${cmd.name} - ${cmd.description}`);
            }
        }
    },
};
