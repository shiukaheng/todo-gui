/**
 * PushToPlan command - add nodes to the end of a plan (create if doesn't exist).
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const pushtoplanCommand: CommandDefinition = {
    name: 'pushtoplan',
    description: 'Add nodes to end of plan (create if needed)',
    aliases: ['ptp'],
    positionals: [
        {
            name: 'planId',
            description: 'Plan ID to push to',
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
            name: 'nodeIds',
            description: 'Node IDs to add (omit to use cursor)',
            required: false,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];

                const nodeIds = Object.keys(graphData.tasks);
                return nodeIds.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: async (args) => {
        const planId = args._[0] as string | undefined;
        let nodeIds = args._.slice(1) as string[];

        if (!planId) {
            output.error('usage: pushtoplan <planId> [nodeId1 nodeId2 ...] (omit nodes to use cursor)');
            return;
        }

        const { api, cursor, graphData } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        // If no node IDs provided, use cursor
        if (nodeIds.length === 0) {
            if (!cursor) {
                output.error('no cursor set - navigate to a node first or provide node IDs');
                return;
            }
            nodeIds = [cursor];
        }

        // Validate all node IDs exist
        const invalidNodes = nodeIds.filter(nodeId => !graphData?.tasks?.[nodeId]);
        if (invalidNodes.length > 0) {
            output.error(`invalid node IDs: ${invalidNodes.join(', ')}`);
            return;
        }

        // Check if plan exists
        const existingPlan = graphData?.plans?.[planId];

        try {
            if (existingPlan) {
                // Plan exists - append to end
                const existingSteps = existingPlan.steps;
                const maxOrder = existingSteps.length > 0
                    ? Math.max(...existingSteps.map(s => s.order))
                    : 0;

                // Create new steps starting after max order
                const newSteps = nodeIds.map((nodeId, index) => ({
                    nodeId: nodeId,
                    order: maxOrder + (index + 1) * 1.0,
                }));

                // Combine existing and new steps
                const allSteps = [
                    ...existingSteps.map(s => ({ nodeId: s.nodeId, order: s.order })),
                    ...newSteps
                ];

                // Update plan
                await api.updatePlanApiPlansPlanIdPatch({
                    planId,
                    planUpdate: {
                        steps: allSteps,
                    },
                });

                output.success(`added ${nodeIds.length} node(s) to plan: ${planId} (now ${allSteps.length} steps)`);
            } else {
                // Plan doesn't exist - create it
                const steps = nodeIds.map((nodeId, index) => ({
                    nodeId: nodeId,
                    order: (index + 1) * 1.0,
                }));

                await api.createPlanApiPlansPost({
                    planCreate: {
                        id: planId,
                        steps,
                    },
                });

                output.success(`created plan: ${planId} with ${steps.length} step(s)`);
            }
        } catch (err) {
            output.error(`failed to push to plan: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
