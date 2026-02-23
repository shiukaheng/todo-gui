/**
 * RenamePlan command - rename a plan's ID.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const renameplanCommand: CommandDefinition = {
    name: 'renameplan',
    description: 'Rename a plan',
    aliases: ['rp'],
    positionals: [
        {
            name: 'oldId',
            description: 'Current plan ID',
            required: true,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.plans) return [];

                const planIds = Object.keys(graphData.plans);
                return planIds.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
        {
            name: 'newId',
            description: 'New plan ID',
            required: true,
        },
    ],
    handler: async (args) => {
        const oldId = args._[0] as string | undefined;
        const newId = args._[1] as string | undefined;

        if (!oldId || !newId) {
            output.error('usage: renameplan <oldId> <newId>');
            return;
        }

        const api = useTodoStore.getState().api;
        if (!api) {
            output.error('not connected to server');
            return;
        }

        try {
            await api.batch({
                batchRequest: {
                    operations: [{ op: 'rename_plan', id: oldId, newId: newId }],
                },
            });
            output.success(`renamed plan: ${oldId} → ${newId}`);
        } catch (err) {
            output.error(`failed to rename plan: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
