import { NestedGraphData, ExtendNestedGraphData } from "../new_utils/nestGraphData";

export type Color = [number, number, number]; // RGB color representation
export type SpecialEffect = "glow" | "none";

export type StyledGraphData<G extends NestedGraphData> = ExtendNestedGraphData<
    // Node extra properties
    {
        text: string;
        color: Color;
        borderColor: Color;
        opacity: number;
        specialEffect: SpecialEffect;
    },
    // Edge extra properties
    {
        text: string;
        color: Color;
        opacity: number;
        dotted: boolean;
    }, G
>;

export function styleGraphData<G extends NestedGraphData>(graphData: G): StyledGraphData<G> {
    return {
        tasks: Object.fromEntries(
            Object.entries(graphData.tasks).map(([taskId, taskWrapper]) => [
                taskId,
                { ...taskWrapper, text: "", color: [1, 1, 1], borderColor: [0.5, 0.5, 0.5], opacity: 1.0, specialEffect: "none" },
            ])
        ),
        dependencies: Object.fromEntries(
            Object.entries(graphData.dependencies).map(([depId, depWrapper]) => [
                depId,
                { ...depWrapper, text: "", color: [0.75, 0.75, 0.75], opacity: 0.8, dotted: false },
            ])
        ),
    } as StyledGraphData<G>;
}
