/**
 * Plan styling pipeline - applies visual properties to plans.
 */

import { ProcessedPlansData } from './preprocessPlans';
import { Color } from '../render/utils';

// ═══════════════════════════════════════════════════════════════════════════
// SEEDED PRNG (cyrb128 + sfc32) - copied from styleGraphData.ts
// ═══════════════════════════════════════════════════════════════════════════

function cyrb128(str: string): [number, number, number, number] {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
        const k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
    return function() {
        a |= 0; b |= 0; c |= 0; d |= 0;
        const t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    };
}

function seededRandom(str: string): () => number {
    const seed = cyrb128(str);
    const rng = sfc32(seed[0], seed[1], seed[2], seed[3]);
    for (let i = 0; i < 15; i++) rng();
    return rng;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function hslToRgb(h: number, s: number, l: number): Color {
    h = h * 6;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 1)      { r = c; g = x; }
    else if (h < 2) { r = x; g = c; }
    else if (h < 3) { g = c; b = x; }
    else if (h < 4) { g = x; b = c; }
    else if (h < 5) { r = x; b = c; }
    else            { r = c; b = x; }
    return [r + m, g + m, b + m];
}

/**
 * Generate a deterministic color from plan ID using seeded random.
 */
function generatePlanColor(planId: string): Color {
    const rng = seededRandom(planId);
    return hslToRgb(rng(), 0.55 + rng() * 0.30, 0.45 + rng() * 0.20);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN STYLING
// ═══════════════════════════════════════════════════════════════════════════

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
 * Apply styling to plans.
 * Generates deterministic colors based on plan ID.
 */
export function stylePlans(plansData: ProcessedPlansData): StyledPlansData {
    const styledPlans: { [key: string]: StyledPlan } = {};

    for (const [planId, plan] of Object.entries(plansData.plans)) {
        styledPlans[planId] = {
            data: { id: plan.id },
            text: plan.text,
            steps: plan.steps,
            color: generatePlanColor(planId),
            opacity: 1.0,
        };
    }

    return { plans: styledPlans };
}
