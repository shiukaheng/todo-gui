/**
 * CommandRegistry - Manages command registration and provides completion.
 */

import {
    CommandDefinition,
    CompletionSuggestion,
    CompletionContext,
    ICommandRegistry,
    CommandResult,
    ParsedArgs,
} from './types';
import { output } from './output';

/** Tokenize input string, respecting quotes */
function tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (inQuote) {
            if (char === inQuote) {
                inQuote = null;
            } else {
                current += char;
            }
        } else if (char === '"' || char === "'") {
            inQuote = char;
        } else if (char === ' ') {
            if (current) {
                tokens.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current || input.endsWith(' ')) {
        tokens.push(current);
    }

    return tokens;
}

/** Parse arguments from tokens using command definition */
function parseArgs(tokens: string[], command: CommandDefinition): ParsedArgs {
    const args: ParsedArgs = { _: [] };
    let i = 0;

    while (i < tokens.length) {
        const token = tokens[i];

        if (token.startsWith('--')) {
            const optName = token.slice(2);
            const opt = command.options?.find(o => o.name === optName);
            if (opt) {
                if (opt.type === 'boolean') {
                    args[optName] = true;
                } else if (i + 1 < tokens.length) {
                    i++;
                    args[optName] = opt.type === 'number' ? Number(tokens[i]) : tokens[i];
                }
            }
        } else if (token.startsWith('-')) {
            const alias = token.slice(1);
            const opt = command.options?.find(o => o.alias === alias);
            if (opt) {
                if (opt.type === 'boolean') {
                    args[opt.name] = true;
                } else if (i + 1 < tokens.length) {
                    i++;
                    args[opt.name] = opt.type === 'number' ? Number(tokens[i]) : tokens[i];
                }
            }
        } else {
            args._.push(token);
        }
        i++;
    }

    // Apply defaults
    for (const opt of command.options || []) {
        if (args[opt.name] === undefined && opt.default !== undefined) {
            args[opt.name] = opt.default;
        }
    }

    return args;
}

export class CommandRegistry implements ICommandRegistry {
    private commands = new Map<string, CommandDefinition>();
    private aliasMap = new Map<string, string>();

    register(command: CommandDefinition): void {
        this.commands.set(command.name, command);
        for (const alias of command.aliases || []) {
            this.aliasMap.set(alias, command.name);
        }
    }

    unregister(name: string): void {
        const command = this.commands.get(name);
        if (command) {
            for (const alias of command.aliases || []) {
                this.aliasMap.delete(alias);
            }
            this.commands.delete(name);
        }
    }

    get(name: string): CommandDefinition | undefined {
        return this.commands.get(name) || this.commands.get(this.aliasMap.get(name) || '');
    }

    getAll(): CommandDefinition[] {
        return Array.from(this.commands.values());
    }

    complete(input: string, cursorPosition: number): CompletionSuggestion[] {
        const inputUpToCursor = input.slice(0, cursorPosition);
        const tokens = tokenize(inputUpToCursor);

        if (tokens.length === 0) {
            // Show all commands
            return this.getAll().map(cmd => ({
                value: cmd.name,
                description: cmd.description,
                type: 'command' as const,
            }));
        }

        const context: CompletionContext = {
            tokens,
            currentIndex: tokens.length - 1,
            partial: tokens[tokens.length - 1] || '',
        };

        // First token: complete command name
        if (tokens.length === 1) {
            const partial = context.partial.toLowerCase();
            const suggestions: CompletionSuggestion[] = [];

            for (const cmd of this.getAll()) {
                if (cmd.name.toLowerCase().startsWith(partial)) {
                    suggestions.push({
                        value: cmd.name,
                        description: cmd.description,
                        type: 'command',
                    });
                }
                for (const alias of cmd.aliases || []) {
                    if (alias.toLowerCase().startsWith(partial)) {
                        suggestions.push({
                            value: alias,
                            description: `${cmd.description} (alias)`,
                            type: 'command',
                        });
                    }
                }
            }

            return suggestions;
        }

        // Command is known, complete arguments
        const commandName = tokens[0];
        const command = this.get(commandName);
        if (!command) {
            return [];
        }

        return this.completeCommandArgs(command, context);
    }

    private completeCommandArgs(
        command: CommandDefinition,
        context: CompletionContext
    ): CompletionSuggestion[] {
        const { tokens, partial } = context;
        const suggestions: CompletionSuggestion[] = [];

        // Check if we're completing an option value
        const prevToken = tokens[tokens.length - 2];
        if (prevToken?.startsWith('-')) {
            const optName = prevToken.startsWith('--')
                ? prevToken.slice(2)
                : command.options?.find(o => o.alias === prevToken.slice(1))?.name;

            if (optName) {
                const opt = command.options?.find(o => o.name === optName);
                if (opt?.complete) {
                    const values = opt.complete(partial, context);
                    return values.map(v => ({
                        value: v,
                        type: 'value' as const,
                    }));
                }
            }
        }

        // Complete options
        if (partial.startsWith('-')) {
            for (const opt of command.options || []) {
                const longOpt = `--${opt.name}`;
                if (longOpt.startsWith(partial)) {
                    suggestions.push({
                        value: longOpt,
                        description: opt.description,
                        type: 'option',
                    });
                }
                if (opt.alias) {
                    const shortOpt = `-${opt.alias}`;
                    if (shortOpt.startsWith(partial)) {
                        suggestions.push({
                            value: shortOpt,
                            description: opt.description,
                            type: 'option',
                        });
                    }
                }
            }
            return suggestions;
        }

        // Complete positional arguments
        // Count how many positionals we've already provided
        let positionalCount = 0;
        for (let i = 1; i < tokens.length - 1; i++) {
            if (!tokens[i].startsWith('-')) {
                positionalCount++;
            } else if (!tokens[i].startsWith('--')) {
                // Skip short option and its value
                const opt = command.options?.find(o => o.alias === tokens[i].slice(1));
                if (opt && opt.type !== 'boolean') i++;
            } else {
                // Skip long option and its value
                const opt = command.options?.find(o => o.name === tokens[i].slice(2));
                if (opt && opt.type !== 'boolean') i++;
            }
        }

        const positional = command.positionals?.[positionalCount];
        if (positional?.complete) {
            const values = positional.complete(partial, context);
            return values.map(v => ({
                value: v,
                description: positional.description,
                type: 'value',
            }));
        }

        // Also suggest options if not starting with -
        for (const opt of command.options || []) {
            suggestions.push({
                value: `--${opt.name}`,
                description: opt.description,
                type: 'option',
            });
        }

        return suggestions;
    }

    async execute(input: string): Promise<CommandResult> {
        const tokens = tokenize(input.trim());
        if (tokens.length === 0) {
            return { success: true };
        }

        const commandName = tokens[0];
        const command = this.get(commandName);

        if (!command) {
            const error = `unknown command: ${commandName}`;
            output.error(error);
            return { success: false, error };
        }

        try {
            const args = parseArgs(tokens.slice(1), command);
            await command.handler(args);
            return { success: true };
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            output.error(error);
            return { success: false, error };
        }
    }
}

/** Global command registry singleton */
export const commandRegistry = new CommandRegistry();
