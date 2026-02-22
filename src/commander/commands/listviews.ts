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
        const { displayData, activeView } = useTodoStore.getState();

        if (!displayData?.views || Object.keys(displayData.views).length === 0) {
            output.print('no views available');
            return;
        }

        const lines: string[] = [];
        for (const [id] of Object.entries(displayData.views)) {
            const marker = id === activeView ? ' *' : '';
            lines.push(`${id}${marker}`);
        }
        output.print(lines.join('\n'));
    },
};
