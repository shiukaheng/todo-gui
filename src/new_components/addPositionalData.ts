import { NestedGraphData, ExtendNestedGraphData } from "../new_utils/nestGraphData";

export type Vec2 = [number, number];

export type PositionalGraphData<G extends NestedGraphData> = ExtendNestedGraphData<
    // Node extra properties
    {
        position: Vec2;
    },
    // Edge extra properties (unchanged)
    {},
    G
>;

export function addPositionalData<G extends NestedGraphData>(graphData: G): PositionalGraphData<G> {
    return {
        tasks: Object.fromEntries(
            Object.entries(graphData.tasks).map(([taskId, taskWrapper]) => [
                taskId,
                { ...taskWrapper, position: [0, 0] },
            ])
        ),
        dependencies: Object.fromEntries(
            Object.entries(graphData.dependencies).map(([depId, depWrapper]) => [
                depId,
                { ...depWrapper },
            ])
        ),
    } as PositionalGraphData<G>;
}
