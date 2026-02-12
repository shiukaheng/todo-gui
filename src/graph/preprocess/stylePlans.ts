/**
 * Plan styling pipeline - applies visual properties to plans.
 * Currently a pass-through, but provides extension point for future styling.
 */

import { ProcessedPlansData, ProcessedPlan } from './preprocessPlans';
import { Color } from '../render/utils';

export interface StyledPlan {
    data: { id: string };
    text: string | null;
    steps: Array<{ nodeId: string; order: number }>;
    color: Color;
    opacity: number;
}

export interface StyledPlansData {
    plans: { [key: string]: StyledPlan };
}

/**
 * Apply base styling to plans.
 * Currently assigns default colors and opacity.
 */
export function stylePlans(plansData: ProcessedPlansData): StyledPlansData {
    const styledPlans: { [key: string]: StyledPlan } = {};

    for (const [planId, plan] of Object.entries(plansData.plans)) {
        styledPlans[planId] = {
            data: { id: plan.id },
            text: plan.text,
            steps: plan.steps,
            color: [0.5, 0.5, 0.8] as Color,  // Default blue-ish color
            opacity: 1.0,
        };
    }

    return { plans: styledPlans };
}

/**
 * Apply cursor-based styling to plans.
 * Future: highlight plans containing the cursor node.
 */
export function cursorStylePlans(
    plansData: StyledPlansData,
    cursor: string | null
): StyledPlansData {
    // Pass-through for now
    // Future: check if cursor is in plan.steps, modify color/opacity
    return plansData;
}
