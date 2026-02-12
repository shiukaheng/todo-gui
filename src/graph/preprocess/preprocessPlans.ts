/**
 * Plan preprocessing: validates, sorts, and indexes plans for efficient rendering.
 */

import { PlanOut } from "todo-client";

export interface ProcessedPlan {
    id: string;
    text: string | null;
    steps: Array<{ nodeId: string; order: number }>;
    created_at: number;
    updated_at: number;
}

export interface ProcessedPlansData {
    plans: Record<string, ProcessedPlan>;
    nodeToPlans: Map<string, string[]>;  // reverse index: nodeId -> planIds
}

/**
 * Preprocess plans: sort steps, filter invalid node references, build reverse index.
 */
export function preprocessPlans(
    plansDict: Record<string, PlanOut>,
    validNodeIds: Set<string>
): ProcessedPlansData {
    const plans: Record<string, ProcessedPlan> = {};
    const nodeToPlans = new Map<string, string[]>();

    for (const [planId, plan] of Object.entries(plansDict)) {
        // Sort steps by order and filter out steps referencing non-existent nodes
        const validSteps = plan.steps
            .filter(step => validNodeIds.has(step.node_id))
            .sort((a, b) => a.order - b.order);

        plans[planId] = {
            id: plan.id,
            text: plan.text,
            steps: validSteps.map(s => ({ nodeId: s.node_id, order: s.order })),
            created_at: plan.created_at,
            updated_at: plan.updated_at,
        };

        // Build reverse index for quick "which plans contain this node?" lookups
        for (const step of validSteps) {
            const existing = nodeToPlans.get(step.node_id) || [];
            nodeToPlans.set(step.node_id, [...existing, planId]);
        }
    }

    return { plans, nodeToPlans };
}

export const EMPTY_PLANS_DATA: ProcessedPlansData = {
    plans: {},
    nodeToPlans: new Map(),
};
