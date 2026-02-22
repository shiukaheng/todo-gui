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
import { setnavmodeCommand } from './setnavmode';
import { setsimmodeCommand } from './setsimmode';
import { addplanCommand } from './addplan';
import { deleteplanCommand } from './deleteplan';
import { pushtoplanCommand } from './pushtoplan';
import { popfromplanCommand } from './popfromplan';
import { renameplanCommand } from './renameplan';
import { filterCommand } from './filter';
import { clearfilterCommand } from './clearfilter';
import { reattachCommand } from './reattach';
import { deleteviewCommand } from './deleteview';
import { setviewCommand } from './setview';
import { listviewsCommand } from './listviews';
import { hideCommand } from './hide';
import { unhideCommand } from './unhide';

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
    commandRegistry.register(setnavmodeCommand);
    commandRegistry.register(setsimmodeCommand);
    commandRegistry.register(addplanCommand);
    commandRegistry.register(deleteplanCommand);
    commandRegistry.register(pushtoplanCommand);
    commandRegistry.register(popfromplanCommand);
    commandRegistry.register(renameplanCommand);
    commandRegistry.register(filterCommand);
    commandRegistry.register(clearfilterCommand);
    commandRegistry.register(reattachCommand);
    commandRegistry.register(setviewCommand);
    commandRegistry.register(deleteviewCommand);
    commandRegistry.register(listviewsCommand);
    commandRegistry.register(hideCommand);
    commandRegistry.register(unhideCommand);
}
