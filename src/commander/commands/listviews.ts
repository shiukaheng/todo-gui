/**
 * Listviews command - list available display views.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const listviewsCommand: CommandDefinition = {
    name: 'listviews',
    description: 'List available display views',
    aliases: ['lv'],
    handler: () => {
        const { displayData, currentViewId } = useTodoStore.getState();

        if (!displayData?.views || Object.keys(displayData.views).length === 0) {
            output.print('no views available');
            return;
        }

        const lines: string[] = [];
        for (const [id, view] of Object.entries(displayData.views)) {
            const marker = id === currentViewId ? ' *' : '';
            const posCount = Object.keys(view.positions).length;
            lines.push(`${id}${marker} (${posCount} positions)`);
        }
        output.print(lines.join('\n'));
    },
};
