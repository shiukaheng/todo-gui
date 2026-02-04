/**
 * Compute transforms to fit graph content within viewport.
 */

import { ViewportInfo, createPanZoomTransform, ViewTransform } from "./index";
import { PositionedGraphData } from "../simulation/utils";

/**
 * Compute a transform that fits all nodes in the viewport.
 * Returns null if there are no nodes.
 */
export function computeFitTransform(
    positionedData: PositionedGraphData<any>,
    viewport: ViewportInfo,
    padding: number = 50
): ViewTransform | null {
    const positions = Object.values(positionedData.tasks)
        .map((t: any) => t.position)
        .filter((p): p is [number, number] => p !== undefined);

    if (positions.length === 0) return null;

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of positions) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    const boundsWidth = maxX - minX || 1;
    const boundsHeight = maxY - minY || 1;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Compute scale to fit bounds in viewport (with padding)
    const availableWidth = viewport.width - padding * 2;
    const availableHeight = viewport.height - padding * 2;
    const scale = Math.min(
        availableWidth / boundsWidth,
        availableHeight / boundsHeight,
        2 // Cap max zoom to avoid over-zooming on small graphs
    );

    // Compute translation to center the graph
    const panX = viewport.width / 2 - centerX * scale;
    const panY = viewport.height / 2 - centerY * scale;

    return createPanZoomTransform(scale, panX, panY);
}
