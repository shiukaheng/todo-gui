/**
 * PopFromPlan command - remove the last node from a plan.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const popfromplanCommand: CommandDefinition = {
    name: 'popfromplan',
    description: 'Remove last node from plan',
    aliases: ['pfp'],
    positionals: [
        {
            name: 'planId',
            description: 'Plan ID to pop from',
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
            output.error('usage: popfromplan <planId>');
            return;
        }

        const { api, graphData } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        // Check if plan exists
        const existingPlan = graphData?.plans?.[planId];

        if (!existingPlan) {
            output.error(`plan does not exist: ${planId}`);
            return;
        }

        const existingSteps = existingPlan.steps;

        if (existingSteps.length === 0) {
            output.error(`plan is already empty: ${planId}`);
            return;
        }

        // Remove the last step (highest order)
        const sortedSteps = [...existingSteps].sort((a, b) => a.order - b.order);
        const stepsToKeep = sortedSteps.slice(0, -1);

        try {
            await api.batchOperationsApiBatchPost({
                batchRequest: {
                    operations: [{
                        op: 'update_plan',
                        id: planId,
                        steps: stepsToKeep.map(s => ({ nodeId: s.nodeId, order: s.order })),
                    }],
                },
            });

            output.success(`removed last step from plan: ${planId} (now ${stepsToKeep.length} step(s))`);
        } catch (err) {
            output.error(`failed to pop from plan: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
