import { Vector } from "../vector/vector";

/**
 * SpatialNodeContent is the spatial information that is stored in a node. It is used to store how the graph is laid out.
 */
export interface SpatialNode {
    position: Vector;
}

export const getDefaultSpatialNode = (): SpatialNode => ({
    position: [0, 0],
});