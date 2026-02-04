/**
 * Command definitions.
 * Import and register all commands here.
 */

import { commandRegistry } from '../CommandRegistry';
import { echoCommand } from './echo';
import { helpCommand } from './help';
import { gotoCommand } from './goto';

/** Register all built-in commands */
export function registerBuiltinCommands(): void {
    commandRegistry.register(echoCommand);
    commandRegistry.register(helpCommand);
    commandRegistry.register(gotoCommand);
}
