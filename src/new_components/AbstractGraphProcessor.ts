import { NestedGraphData } from "../new_utils/nestGraphData";
import { RenderGraphData } from "./rendererUtils";

export type GraphChangeCallback = (graph: RenderGraphData) => void;

/**
 * Abstract contract for a GraphProcessor.
 *
 * Constructor receives a callback that fires whenever processed graph updates.
 * Call update() to feed in new logical graph data.
 * Call destroy() to clean up.
 */
export abstract class AbstractGraphProcessor {
    constructor(protected onUpdate: GraphChangeCallback) {}

    abstract get processedGraph(): RenderGraphData;
    abstract update(graph: NestedGraphData): void;
    abstract destroy(): void;
}