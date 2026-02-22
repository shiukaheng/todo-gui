/**
 * Currentview command - show active display view details.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const currentviewCommand: CommandDefinition = {
    name: 'currentview',
    description: 'Show the currently active display view',
    aliases: ['cv'],
    handler: () => {
        const { activeView, displayData, filterNodeIds, hideNodeIds } = useTodoStore.getState();
        const view = displayData?.views?.[activeView];

        output.print([
            `view: ${activeView}`,
            `exists: ${view ? 'yes' : 'no'}`,
            `whitelist: ${filterNodeIds?.length ?? 0}`,
            `blacklist: ${hideNodeIds?.length ?? 0}`,
        ].join('\n'));
    },
};
