import { GraphData, GraphNode } from "@/types/GraphData";

export interface ColoredGraphNode extends GraphNode {
    color: [number, number, number]; // RGB values 0-1
}

export interface ColoredGraphData extends Omit<GraphData, 'nodes'> {
    nodes: ColoredGraphNode[];
}

/**
 * Better hash function using FNV-1a algorithm for more uniform distribution
 */
function hashString(str: string): number {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    // Use modulo with a prime number for better distribution
    return Math.abs(hash % 10007) / 10007;
}

/**
 * Convert RGB to HSV
 * RGB: [0, 1], returns H: [0, 1], S: [0, 1], V: [0, 1]
 */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let h = 0;
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    
    if (delta !== 0) {
        if (max === r) {
            h = (((g - b) / delta) % 6) / 6;
        } else if (max === g) {
            h = ((b - r) / delta + 2) / 6;
        } else {
            h = ((r - g) / delta + 4) / 6;
        }
    }
    
    if (h < 0) h += 1;
    
    return [h, s, v];
}

/**
 * Convert HSV to RGB
 * H: [0, 1], S: [0, 1], V: [0, 1], returns RGB: [0, 1]
 */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    h = h * 6; // Convert to [0, 6) range for sector calculation
    const c = v * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = v - c;
    
    let r = 0, g = 0, b = 0;
    
    if (h < 1) {
        r = c; g = x; b = 0;
    } else if (h < 2) {
        r = x; g = c; b = 0;
    } else if (h < 3) {
        r = 0; g = c; b = x;
    } else if (h < 4) {
        r = 0; g = x; b = c;
    } else if (h < 5) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }
    
    return [r + m, g + m, b + m];
}

/**
 * Convert HSL to RGB
 * H: [0, 1], S: [0, 1], L: [0, 1], returns RGB: [0, 1]
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = h * 6; // Convert to [0, 6) range for sector calculation
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - c / 2;
    
    let r = 0, g = 0, b = 0;
    
    if (h < 1) {
        r = c; g = x; b = 0;
    } else if (h < 2) {
        r = x; g = c; b = 0;
    } else if (h < 3) {
        r = 0; g = c; b = x;
    } else if (h < 4) {
        r = 0; g = x; b = c;
    } else if (h < 5) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }
    
    return [r + m, g + m, b + m];
}

/**
 * Average multiple RGB colors in [0,1] range
 */
function averageColors(colors: [number, number, number][]): [number, number, number] {
    if (colors.length === 0) return [0.5, 0.5, 0.5]; // Gray default
    
    const sum = colors.reduce(
        (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
        [0, 0, 0]
    );
    
    return [
        sum[0] / colors.length,
        sum[1] / colors.length,
        sum[2] / colors.length
    ];
}

/**
 * Clamp hue to range [0, 1)
 */
function clampHue(value: number): number {
    return ((value % 1) + 1) % 1; // Wrap to [0, 1)
}

/**
 * Clamp saturation/value to range [0, 1]
 */
function clampSV(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * Apply random walk to a color in HSV space
 * Takes average parent color and adds random change
 * deltaHue: how much hue can change (0-1 scale)
 * deltaSV: how much saturation/value can change (0-1 scale)
 */
function randomWalkColorHSV(
    avgParentColor: [number, number, number], 
    nodeId: string, 
    deltaHue: number = 0.1,
    deltaSV: number = 0.1
): [number, number, number] {
    // Convert RGB to HSV
    const [h, s, v] = rgbToHsv(avgParentColor[0], avgParentColor[1], avgParentColor[2]);
    
    // Generate pseudo-random deltas for each channel
    const hDelta = (hashString(nodeId + "_h") - 0.5) * 2; // Range [-1, 1]
    const sDelta = (hashString(nodeId + "_s") - 0.5) * 2;
    const vDelta = (hashString(nodeId + "_v") - 0.5) * 2;
    
    // Apply random walk in HSV space
    const newH = clampHue(h + hDelta * deltaHue);
    const newS = clampSV(s + sDelta * deltaSV);
    const newV = clampSV(v + vDelta * deltaSV);
    
    // Convert back to RGB
    return hsvToRgb(newH, newS, newV);
}

/**
 * Assign initial colors to nodes based on their ID hash
 */
function colorNodesInitial(graph: GraphData): ColoredGraphData {
    const coloredNodes: ColoredGraphNode[] = graph.nodes.map(node => {
        if (node.data.id === "root") {
            return {
                ...node,
                color: [0.5, 0.5, 0.5]
            }
        }
        // Hash the node ID to get a hue value (0-1)
        const hue = hashString(node.id);
        
        // Use high saturation and medium lightness for vibrant colors
        const saturation = 0.7;
        const lightness = 0.6;
        
        const color = hslToRgb(hue, saturation, lightness);
        
        return {
            ...node,
            color
        };
    });
    
    return {
        ...graph,
        nodes: coloredNodes
    };
}

/**
 * Propagate colors from parents to children using random walk in HSV space
 */
function propagateColors(
    nodeMap: Map<string, ColoredGraphNode>,
    parentsMap: Map<string, string[]>,
    sortedNodeIds: string[],
    deltaHue: number,
    deltaSV: number
): Map<string, [number, number, number]> {
    const finalColors = new Map<string, [number, number, number]>();
    
    sortedNodeIds.forEach(nodeId => {
        const node = nodeMap.get(nodeId);
        if (!node) return;
        
        const parents = parentsMap.get(nodeId) || [];
        
        if (parents.length === 0 || (parents.length === 1 && parents[0] === "root")) {
            // No parents, keep initial color
            finalColors.set(nodeId, node.color);
        } else {
            // Get parent colors
            const parentColors = parents
                .map(parentId => finalColors.get(parentId))
                .filter((color): color is [number, number, number] => color !== undefined);
            
            if (parentColors.length > 0) {
                // Random walk in HSV space: start with average parent color, add random change
                const avgParentColor = averageColors(parentColors);
                const newColor = randomWalkColorHSV(avgParentColor, nodeId, deltaHue, deltaSV);
                finalColors.set(nodeId, newColor);
            } else {
                // Fallback to initial color
                finalColors.set(nodeId, node.color);
            }
        }
    });
    
    return finalColors;
}

/**
 * Assign colors to nodes and propagate to children using random walk in HSV space
 * Children get the average of their parents' colors plus a random delta
 * @param deltaHue - how much hue can shift (0-1 scale, default 0.1)
 * @param deltaSV - how much saturation/value can shift (0-1 scale, default 0.1)
 */
export function colorNodes(graph: GraphData, deltaHue: number = 0.1, deltaSV: number = 0.1): ColoredGraphData {
    // Step 1: Initialize all nodes with base colors
    let coloredGraph = colorNodesInitial(graph);
    
    // Step 2: Build adjacency structures
    const nodeMap = new Map<string, ColoredGraphNode>();
    coloredGraph.nodes.forEach(node => nodeMap.set(node.id, node));
    
    // Map each node to its parents (incoming edges)
    const parentsMap = new Map<string, string[]>();
    coloredGraph.nodes.forEach(node => parentsMap.set(node.id, []));
    
    coloredGraph.edges.forEach(edge => {
        const parents = parentsMap.get(edge.target);
        if (parents) {
            parents.push(edge.source);
        }
    });
    
    // Step 3: Topological sort to process nodes in order (parents before children)
    const visited = new Set<string>();
    const sorted: string[] = [];
    
    function dfs(nodeId: string) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        
        const parents = parentsMap.get(nodeId) || [];
        parents.forEach(parentId => dfs(parentId));
        
        sorted.push(nodeId);
    }
    
    coloredGraph.nodes.forEach(node => dfs(node.id));
    
    // Step 4: Propagate colors in topological order
    const finalColors = propagateColors(nodeMap, parentsMap, sorted, deltaHue, deltaSV);
    
    // Step 5: Create final graph with propagated colors
    const finalNodes: ColoredGraphNode[] = coloredGraph.nodes.map(node => ({
        ...node,
        color: finalColors.get(node.id) || node.color
    }));
    
    return {
        ...coloredGraph,
        nodes: finalNodes
    };
}
