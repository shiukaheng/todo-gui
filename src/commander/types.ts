/**
 * Command system types and interfaces.
 */

/** Parsed command arguments */
export interface ParsedArgs {
    _: string[];  // Positional arguments
    [key: string]: unknown;
}

/** Option definition for a command */
export interface OptionDefinition {
    name: string;
    alias?: string;
    description: string;
    type: 'string' | 'boolean' | 'number';
    required?: boolean;
    default?: unknown;
    /** Custom completer for this option's value */
    complete?: (partial: string, context: CompletionContext) => string[];
}

/** Positional argument definition */
export interface PositionalDefinition {
    name: string;
    description: string;
    required?: boolean;
    /** Custom completer for this positional */
    complete?: (partial: string, context: CompletionContext) => string[];
}

/** Context passed to completion functions */
export interface CompletionContext {
    /** All tokens parsed so far */
    tokens: string[];
    /** Current token index being completed */
    currentIndex: number;
    /** The partial text being completed */
    partial: string;
}

/** Command definition */
export interface CommandDefinition {
    name: string;
    description: string;
    aliases?: string[];
    positionals?: PositionalDefinition[];
    options?: OptionDefinition[];
    /** Execute the command */
    handler: (args: ParsedArgs) => void | Promise<void>;
}

/** Completion suggestion */
export interface CompletionSuggestion {
    value: string;
    description?: string;
    type: 'command' | 'option' | 'value';
}

/** Command registry interface */
export interface ICommandRegistry {
    register(command: CommandDefinition): void;
    unregister(name: string): void;
    get(name: string): CommandDefinition | undefined;
    getAll(): CommandDefinition[];
    /** Get completions for input */
    complete(input: string, cursorPosition: number): CompletionSuggestion[];
    /** Parse and execute a command */
    execute(input: string): Promise<CommandResult>;
}

/** Result of command execution */
export interface CommandResult {
    success: boolean;
    output?: string;
    error?: string;
}

/** Command plane state */
export interface CommandPlaneState {
    visible: boolean;
    input: string;
    cursorPosition: number;
    completions: CompletionSuggestion[];
    selectedCompletionIndex: number;
    history: string[];
    historyIndex: number;
}
