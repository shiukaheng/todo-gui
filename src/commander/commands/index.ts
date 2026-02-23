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
import { resetviewCommand } from './resetview';
import { reattachCommand } from './reattach';
import { deleteviewCommand } from './deleteview';
import { listviewsCommand } from './listviews';
import { saveposCommand } from './savepos';
import { mergeCommand } from './merge';
import { renameCommand } from './rename';
import { renameviewCommand } from './renameview';
import { setincludefilterCommand } from './setincludefilter';
import { addincludefilterCommand } from './addincludefilter';
import { deleteincludefilterCommand } from './deleteincludefilter';
import { setexcludefilterCommand } from './setexcludefilter';
import { addexcludefilterCommand } from './addexcludefilter';
import { deleteexcludefilterCommand } from './deleteexcludefilter';
import { setcompletedcullfilterCommand } from './setcompletedcullfilter';
import { saveviewCommand } from './saveview';
import { loadviewCommand } from './loadview';

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
    commandRegistry.register(resetviewCommand);
    commandRegistry.register(reattachCommand);
    commandRegistry.register(deleteviewCommand);
    commandRegistry.register(listviewsCommand);
    commandRegistry.register(saveposCommand);
    commandRegistry.register(mergeCommand);
    commandRegistry.register(renameCommand);
    commandRegistry.register(renameviewCommand);
    commandRegistry.register(setincludefilterCommand);
    commandRegistry.register(addincludefilterCommand);
    commandRegistry.register(deleteincludefilterCommand);
    commandRegistry.register(setexcludefilterCommand);
    commandRegistry.register(addexcludefilterCommand);
    commandRegistry.register(deleteexcludefilterCommand);
    commandRegistry.register(setcompletedcullfilterCommand);
    commandRegistry.register(saveviewCommand);
    commandRegistry.register(loadviewCommand);
}
