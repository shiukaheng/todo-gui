/**
 * DeletePlan command - delete a plan.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const deleteplanCommand: CommandDefinition = {
    name: 'deleteplan',
    description: 'Delete a plan',
    aliases: ['dp'],
    positionals: [
        {
            name: 'planId',
            description: 'Plan ID to delete',
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
    ],
    handler: async (args) => {
        const planId = args._[0] as string | undefined;

        if (!planId) {
            output.error('usage: deleteplan <planId>');
            return;
        }

        const api = useTodoStore.getState().api;
        if (!api) {
            output.error('not connected to server');
            return;
        }

        const graphData = useTodoStore.getState().graphData;
        if (!graphData?.plans?.[planId]) {
            output.error(`plan not found: ${planId}`);
            return;
        }

        try {
            await api.batchOperationsApiBatchPost({
                batchRequest: {
                    operations: [{ op: 'delete_plan', id: planId }],
                },
            });
            output.success(`deleted plan: ${planId}`);
        } catch (err) {
            output.error(`failed to delete plan: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
