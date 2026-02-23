/**
 * Listviews command - list available display views.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const listviewsCommand: CommandDefinition = {
    name: 'listviews',
    description: 'List available display views',
    handler: () => {
        const { viewsData } = useTodoStore.getState();

        if (!viewsData?.views || Object.keys(viewsData.views).length === 0) {
            output.print('no views available');
            return;
        }

        const lines: string[] = [];
        for (const [id] of Object.entries(viewsData.views)) {
            lines.push(id);
        }
        output.print(lines.join('\n'));
    },
};
