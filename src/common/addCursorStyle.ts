import { GraphData, GraphNode } from "@/types/GraphData";

/**
 * Pure function that adds borderColor property to selected nodes.
 * The borderColor is added at the top level (not in .data) as UI-generated metadata.
 * Selected nodes always get a white border.
 * 
 * @param graph - The graph data with nodes and edges
 * @param selectedIds - Array of node IDs that should have cursor style applied
 * @returns New graph data with borderColor added to selected nodes
 */
export function addCursorStyle(
    graph: GraphData,
    selectedIds: string[]
): GraphData {
    const selectedSet = new Set(selectedIds);
    
    const nodesWithCursor = graph.nodes.map(node => {
        if (!selectedSet.has(node.id)) {
            return node;
        }
        
        return {
            ...node,
            borderColor: 'white'
        };
    });
    
    return {
        nodes: nodesWithCursor,
        edges: graph.edges
    };
}
