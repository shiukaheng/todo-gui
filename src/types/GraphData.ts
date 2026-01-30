/**
 * Simple graph data structure for input from Neo4j or other external sources
 */

export interface GraphNode {
    id: string; // Neo4j internal ID
    data: Record<string, any>; // All node properties, labels, etc.
    // Optional UI styling properties (added by styling functions)
    color?: [number, number, number]; // RGB in [0,1] range
    borderColor?: string; // CSS color string
    opacity?: number; // 0 to 1
    dotted?: boolean; // Dotted border
}

export interface GraphEdge {
    id: string; // Neo4j relationship internal ID
    source: string; // Source node ID
    target: string; // Target node ID
    data: Record<string, any>; // All edge properties, type, weight, etc.
    // Optional UI styling properties (added by styling functions)
    color?: [number, number, number]; // RGB in [0,1] range
    opacity?: number; // 0 to 1
    dotted?: boolean; // Dotted line
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}
