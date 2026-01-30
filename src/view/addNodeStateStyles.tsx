import { GraphData } from "@/types/GraphData";

/**
 * Adds state-based styling to nodes and edges.
 * Styling properties added at top level (not in .data):
 * - color: [number, number, number] - RGB in [0,1] range
 * - opacity: number - 0 to 1
 * - borderColor: string (nodes only) - CSS color string
 */
export function addStateStyles(graphData: GraphData): GraphData {
    // Style nodes based on completion state
    const styledNodes = graphData.nodes.map(node => {
        const newNode = { ...node };
        if (node.data?.completed) {
            newNode.color = [0.0, 1.0, 0.0];
        };
        return newNode;
    });

    // Style edges (currently just pass through, but could add edge-specific styling)
    const styledEdges = graphData.edges.map(edge => {
        return {
            ...edge,
            // Could add edge styling here, e.g.:
            // opacity: edge.data?.active ? 1.0 : 0.3
        };
    });

    return {
        nodes: styledNodes,
        edges: styledEdges
    };
}
