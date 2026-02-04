/**
 * Goto command - navigate to a task by ID with tab completion.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';

export const gotoCommand: CommandDefinition = {
    name: 'goto',
    description: 'Navigate to a task by ID',
    aliases: ['g', 'go'],
    positionals: [
        {
            name: 'taskId',
            description: 'Task ID to navigate to',
            required: true,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];

                const taskIds = Object.keys(graphData.tasks);
                return taskIds.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const taskId = args._[0] as string | undefined;
        if (!taskId) {
            console.log('Usage: goto <taskId>');
            return;
        }

        const graphData = useTodoStore.getState().graphData;
        if (!graphData?.tasks?.[taskId]) {
            console.log(`Task not found: ${taskId}`);
            return;
        }

        useTodoStore.getState().setCursor(taskId);
        console.log(`Navigated to: ${taskId}`);
    },
};
