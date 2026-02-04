/**
 * Command definitions.
 * Import and register all commands here.
 */

import { commandRegistry } from '../CommandRegistry';
import { echoCommand } from './echo';
import { helpCommand } from './help';
import { gotoCommand } from './goto';
import { addCommand } from './add';
import { adddepCommand } from './adddep';
import { addblockCommand } from './addblock';
import { removeCommand } from './remove';
import { statusCommand } from './status';
import { connectCommand, disconnectCommand } from './connect';
import { linkCommand } from './link';
import { unlinkCommand } from './unlink';
import { flipCommand } from './flip';
import { navmodeCommand } from './navmode';

/** Register all built-in commands */
export function registerBuiltinCommands(): void {
    commandRegistry.register(echoCommand);
    commandRegistry.register(helpCommand);
    commandRegistry.register(gotoCommand);
    commandRegistry.register(addCommand);
    commandRegistry.register(adddepCommand);
    commandRegistry.register(addblockCommand);
    commandRegistry.register(removeCommand);
    commandRegistry.register(statusCommand);
    commandRegistry.register(connectCommand);
    commandRegistry.register(disconnectCommand);
    commandRegistry.register(linkCommand);
    commandRegistry.register(unlinkCommand);
    commandRegistry.register(flipCommand);
    commandRegistry.register(navmodeCommand);
}
