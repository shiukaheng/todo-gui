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
        const { currentViewId, displayData, filterNodeIds, blacklistNodeIds } = useTodoStore.getState();
        const view = displayData?.views?.[currentViewId];
        const posCount = view ? Object.keys(view.positions || {}).length : 0;

        output.print([
            `view: ${currentViewId}`,
            `exists: ${view ? 'yes' : 'no'}`,
            `positions: ${posCount}`,
            `whitelist: ${filterNodeIds?.length ?? 0}`,
            `blacklist: ${blacklistNodeIds?.length ?? 0}`,
        ].join('\n'));
    },
};
