/**
 * Graph preprocessing pipeline: raw API data → styled graph ready for rendering.
 */

import { TaskListOut } from "todo-client/dist/client";
import { nestGraphData, NestedGraphData } from "./nestGraphData";
import { computeConnectedComponents, ComponentGraphData } from "./connectedComponents";
import { baseStyleGraphData, conditionalStyleGraphData, StyledGraphData } from "./styleGraphData";

/** Fully processed graph data type. */
export type ProcessedGraphData = StyledGraphData<ComponentGraphData<NestedGraphData>>;

/**
 * Transform raw API task list into styled graph data ready for simulation.
 */
export function preprocessGraph(taskList: TaskListOut): ProcessedGraphData {
    const nested = nestGraphData(taskList);
    const withComponents = computeConnectedComponents(nested);
    const styled = baseStyleGraphData(withComponents);
    return conditionalStyleGraphData(styled);
}
