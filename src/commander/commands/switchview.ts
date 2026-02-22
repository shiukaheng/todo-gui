/**
 * Switchview command - switch active display view.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const switchviewCommand: CommandDefinition = {
    name: 'switchview',
    description: 'Switch to a different display view',
    aliases: ['sv'],
    positionals: [
        {
            name: 'viewId',
            description: 'ID of the view to switch to',
            required: true,
            complete: (partial) => {
                const displayData = useTodoStore.getState().displayData;
                if (!displayData?.views) return [];
                return Object.keys(displayData.views).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: async (args) => {
        const viewId = args._[0] as string | undefined;
        if (!viewId) {
            output.error('usage: switchview <viewId>');
            return;
        }

        const { displayData, setCurrentView } = useTodoStore.getState();

        if (!displayData?.views?.[viewId]) {
            output.error(`view not found: ${viewId}`);
            return;
        }

        setCurrentView(viewId);
        output.success(`switched to view: ${viewId}`);
    },
};
