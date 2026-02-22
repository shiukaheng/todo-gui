/**
 * ===================================================================
 * MODULAR UTILITY - Edge Crossing Detection
 * ===================================================================
 *
 * Detects edge crossings in a graph layout to assess layout quality.
 * Used to determine whether saved positions should be preserved or
 * whether a full layout re-computation is needed.
 *
 * REMOVAL:
 * Delete this file and remove the import + 1 function call in
 * webColaEngine.ts (search for "edgeCrossingDetector").
 *
 * ===================================================================
 */

import { Position } from "./types";

/**
 * Edge representation for crossing detection.
 */
export interface EdgeForCrossing {
    fromId: string;
    toId: string;
}

/**
 * Configuration for edge crossing detection.
 */
export interface EdgeCrossingConfig {
    /**
     * Threshold for determining "good" layout (ratio of crossings).
     * Default: 0.05 (5% of edge pairs can cross)
     */
    threshold?: number;

    /**
     * For large graphs, use sampling instead of checking all pairs.
     * Default: 100 edges (if graph has more, use sampling)
     */
    samplingThreshold?: number;

    /**
     * Number of samples to check when sampling.
     * Default: 200
     */
    sampleSize?: number;
}

export interface EdgeCrossingReport {
    good: boolean;
    ratio: number;
    threshold: number;
    mode: "exact" | "sampled" | "trivial";
    crossings: number;
    checkedPairs: number;
    edgeCount: number;
}

const DEFAULT_CONFIG: Required<EdgeCrossingConfig> = {
    threshold: 0.05,
    samplingThreshold: 100,
    sampleSize: 200,
};

/**
 * Main API: Check if a layout has good quality (few edge crossings).
 *
 * @param positions - Node positions in world space
 * @param edges - Graph edges
 * @param config - Optional configuration
 * @returns true if crossing ratio is below threshold (good layout)
 */
export function hasGoodLayout(
    positions: Record<string, Position>,
    edges: EdgeForCrossing[],
    config: EdgeCrossingConfig = {}
): boolean {
    return evaluateLayoutQuality(positions, edges, config).good;
}

export function evaluateLayoutQuality(
    positions: Record<string, Position>,
    edges: EdgeForCrossing[],
    config: EdgeCrossingConfig = {}
): EdgeCrossingReport {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    if (edges.length < 2) {
        return {
            good: true,
            ratio: 0,
            threshold: cfg.threshold,
            mode: "trivial",
            crossings: 0,
            checkedPairs: 0,
            edgeCount: edges.length,
        };
    }

    let result: { ratio: number; crossings: number; checkedPairs: number; mode: "exact" | "sampled" };
    if (edges.length <= cfg.samplingThreshold) {
        result = calculateExactCrossingRatio(positions, edges);
    } else {
        result = estimateCrossingRatio(positions, edges, cfg.sampleSize);
    }

    const hasSignal = result.checkedPairs > 0;
    return {
        good: hasSignal && result.ratio < cfg.threshold,
        ratio: result.ratio,
        threshold: cfg.threshold,
        mode: result.mode,
        crossings: result.crossings,
        checkedPairs: result.checkedPairs,
        edgeCount: edges.length,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXACT CROSSING DETECTION (for small graphs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate exact crossing ratio by checking all edge pairs.
 * Optimized with bounding box pre-check for fast rejection.
 *
 * Complexity: O(E²) worst case, but typically much faster due to rejection.
 */
function calculateExactCrossingRatio(
    positions: Record<string, Position>,
    edges: EdgeForCrossing[]
): { ratio: number; crossings: number; checkedPairs: number; mode: "exact" } {
    let crossings = 0;
    let validPairs = 0;

    // Check all distinct pairs of edges
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const e1 = edges[i];
            const e2 = edges[j];

            // Skip if edges share a node (they touch at endpoint, not a crossing)
            if (edgesShareNode(e1, e2)) continue;

            // Get positions (skip if any missing)
            const p1 = positions[e1.fromId];
            const p2 = positions[e1.toId];
            const p3 = positions[e2.fromId];
            const p4 = positions[e2.toId];
            if (!p1 || !p2 || !p3 || !p4) continue;

            validPairs++;

            // Fast bounding box rejection (eliminates ~90% of pairs)
            if (!boundingBoxesOverlap(p1, p2, p3, p4)) continue;

            // Expensive line segment intersection test
            if (segmentsIntersect(p1, p2, p3, p4)) {
                crossings++;
            }
        }
    }

    return {
        ratio: validPairs > 0 ? crossings / validPairs : 0,
        crossings,
        checkedPairs: validPairs,
        mode: "exact",
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLED CROSSING DETECTION (for large graphs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate crossing ratio by sampling random edge pairs.
 * Much faster for large graphs, with small accuracy trade-off.
 *
 * Complexity: O(sampleSize) - constant time regardless of graph size.
 */
function estimateCrossingRatio(
    positions: Record<string, Position>,
    edges: EdgeForCrossing[],
    sampleSize: number
): { ratio: number; crossings: number; checkedPairs: number; mode: "sampled" } {
    let crossings = 0;
    let validSamples = 0;
    const maxSamples = Math.min(sampleSize, edges.length * (edges.length - 1) / 2);

    for (let s = 0; s < maxSamples; s++) {
        // Pick two random distinct edges
        const i = Math.floor(Math.random() * edges.length);
        let j = Math.floor(Math.random() * (edges.length - 1));
        if (j >= i) j++; // Ensure j ≠ i

        const e1 = edges[i];
        const e2 = edges[j];

        // Same logic as exact method
        if (edgesShareNode(e1, e2)) continue;

        const p1 = positions[e1.fromId];
        const p2 = positions[e1.toId];
        const p3 = positions[e2.fromId];
        const p4 = positions[e2.toId];
        if (!p1 || !p2 || !p3 || !p4) continue;

        validSamples++;

        if (!boundingBoxesOverlap(p1, p2, p3, p4)) continue;

        if (segmentsIntersect(p1, p2, p3, p4)) {
            crossings++;
        }
    }

    return {
        ratio: validSamples > 0 ? crossings / validSamples : 0,
        crossings,
        checkedPairs: validSamples,
        mode: "sampled",
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRIC UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if two edges share a common node (endpoint).
 */
function edgesShareNode(e1: EdgeForCrossing, e2: EdgeForCrossing): boolean {
    return (
        e1.fromId === e2.fromId ||
        e1.fromId === e2.toId ||
        e1.toId === e2.fromId ||
        e1.toId === e2.toId
    );
}

/**
 * Fast rejection: Check if bounding boxes of two line segments overlap.
 * Eliminates ~90% of pairs without expensive intersection test.
 */
function boundingBoxesOverlap(
    p1: Position,
    p2: Position,
    p3: Position,
    p4: Position
): boolean {
    const minX1 = Math.min(p1.x, p2.x);
    const maxX1 = Math.max(p1.x, p2.x);
    const minY1 = Math.min(p1.y, p2.y);
    const maxY1 = Math.max(p1.y, p2.y);

    const minX2 = Math.min(p3.x, p4.x);
    const maxX2 = Math.max(p3.x, p4.x);
    const minY2 = Math.min(p3.y, p4.y);
    const maxY2 = Math.max(p3.y, p4.y);

    // Boxes overlap if they're NOT separated in either axis
    return !(maxX1 < minX2 || maxX2 < minX1 || maxY1 < minY2 || maxY2 < minY1);
}

/**
 * Line segment intersection test using cross products.
 * Returns true if segments (p1,p2) and (p3,p4) intersect in their interior.
 *
 * Algorithm: Parametric line equations + cross products
 * - Line 1: p1 + t1 * (p2 - p1), where t1 ∈ [0, 1]
 * - Line 2: p3 + t2 * (p4 - p3), where t2 ∈ [0, 1]
 * - Segments intersect if both t1 and t2 are in [0, 1]
 */
function segmentsIntersect(
    p1: Position,
    p2: Position,
    p3: Position,
    p4: Position
): boolean {
    // Direction vectors
    const d1x = p2.x - p1.x;
    const d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x;
    const d2y = p4.y - p3.y;

    // Vector from p1 to p3
    const d3x = p3.x - p1.x;
    const d3y = p3.y - p1.y;

    // Cross product of d1 and d2 (determinant)
    const cross = d1x * d2y - d1y * d2x;

    // Parallel or collinear - no intersection (or infinite intersections)
    if (Math.abs(cross) < 1e-10) return false;

    // Solve for parametric t values
    const t1 = (d3x * d2y - d3y * d2x) / cross;
    const t2 = (d3x * d1y - d3y * d1x) / cross;

    // Intersection exists if both parameters are in [0, 1]
    return t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1;
}
