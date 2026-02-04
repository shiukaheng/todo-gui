/**
 * Help command - shows available commands.
 */

import { CommandDefinition } from '../types';
import { commandRegistry } from '../CommandRegistry';
import { output } from '../output';

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
                output.error(`unknown command: ${cmdName}`);
                return;
            }

            output.print(`${cmd.name} - ${cmd.description}`);
            if (cmd.aliases?.length) {
                output.print(`  aliases: ${cmd.aliases.join(', ')}`);
            }
            if (cmd.positionals?.length) {
                output.print('  arguments:');
                for (const pos of cmd.positionals) {
                    const req = pos.required ? ' (required)' : '';
                    output.print(`    <${pos.name}>${req} - ${pos.description}`);
                }
            }
            if (cmd.options?.length) {
                output.print('  options:');
                for (const opt of cmd.options) {
                    const alias = opt.alias ? `, -${opt.alias}` : '';
                    output.print(`    --${opt.name}${alias} - ${opt.description}`);
                }
            }
        } else {
            output.print('available commands:');
            for (const cmd of commandRegistry.getAll()) {
                output.print(`  ${cmd.name} - ${cmd.description}`);
            }
        }
    },
};
