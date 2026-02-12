/**
 * CreatePlan command - create a new plan with a sequence of tasks.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const createplanCommand: CommandDefinition = {
    name: 'createplan',
    description: 'Create a new plan with a sequence of tasks',
    aliases: ['cp'],
    positionals: [
        {
            name: 'planId',
            description: 'ID for the new plan',
            required: true,
        },
        {
            name: 'nodeIds',
            description: 'Space-separated node IDs in sequence',
            required: true,
        },
    ],
    options: [
        {
            name: 'text',
            alias: 't',
            description: 'Plan description text',
            type: 'string',
        },
    ],
    handler: async (args) => {
        const planId = args._[0] as string | undefined;
        const nodeSequence = args._.slice(1) as string[];

        if (!planId || nodeSequence.length === 0) {
            output.error('usage: createplan <planId> <nodeId1> <nodeId2> ... [--text <text>]');
            return;
        }

        const api = useTodoStore.getState().api;
        if (!api) {
            output.error('not connected to server');
            return;
        }

        const graphData = useTodoStore.getState().graphData;
        if (graphData?.plans?.[planId]) {
            output.error(`plan already exists: ${planId}`);
            return;
        }

        // Validate all node IDs exist
        const invalidNodes = nodeSequence.filter(nodeId => !graphData?.tasks?.[nodeId]);
        if (invalidNodes.length > 0) {
            output.error(`invalid node IDs: ${invalidNodes.join(', ')}`);
            return;
        }

        // Build steps with float ordering (1.0, 2.0, 3.0, ...)
        const steps = nodeSequence.map((nodeId, index) => ({
            nodeId: nodeId,  // camelCase for TypeScript client
            order: (index + 1) * 1.0,
        }));

        try {
            await api.createPlanApiPlansPost({
                planCreate: {
                    id: planId,
                    text: args.text as string | undefined,
                    steps,
                },
            });
            output.success(`created plan: ${planId} with ${steps.length} steps`);
        } catch (err) {
            output.error(`failed to create plan: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
