import { NestedGraphData, ExtendNestedGraphData } from "../new_utils/nestGraphData";

/**
 * Graph data extended with connected component information.
 * Each node gets a `componentId` indicating which subgraph it belongs to.
 */
export type ComponentGraphData<G extends NestedGraphData> = ExtendNestedGraphData<
    { componentId: number },
    {},
    G
>;

/**
 * Union-Find (Disjoint Set Union) data structure for efficient component detection.
 * Uses path compression and union by rank for near O(1) amortized operations.
 */
class UnionFind {
    private parent: Map<string, string> = new Map();
    private rank: Map<string, number> = new Map();

    /** Initialize a node as its own parent. */
    add(id: string): void {
        if (!this.parent.has(id)) {
            this.parent.set(id, id);
            this.rank.set(id, 0);
        }
    }

    /** Find the root of a node's component, with path compression. */
    find(id: string): string {
        const p = this.parent.get(id);
        if (p === undefined) {
            this.add(id);
            return id;
        }
        if (p !== id) {
            const root = this.find(p);
            this.parent.set(id, root); // Path compression
            return root;
        }
        return id;
    }

    /** Union two nodes into the same component, using union by rank. */
    union(a: string, b: string): void {
        const rootA = this.find(a);
        const rootB = this.find(b);
        if (rootA === rootB) return;

        const rankA = this.rank.get(rootA)!;
        const rankB = this.rank.get(rootB)!;

        if (rankA < rankB) {
            this.parent.set(rootA, rootB);
        } else if (rankA > rankB) {
            this.parent.set(rootB, rootA);
        } else {
            this.parent.set(rootB, rootA);
            this.rank.set(rootA, rankA + 1);
        }
    }
}

/**
 * Compute connected components for a graph.
 * Adds a `componentId` (0-indexed integer) to each node indicating which
 * connected subgraph it belongs to. Nodes in the same component share the same ID.
 *
 * Uses Union-Find for O(n α(n)) time complexity (nearly linear).
 *
 * @param graphData - Input graph with nodes and edges
 * @returns Same graph with `componentId` added to each node
 */
export function computeConnectedComponents<G extends NestedGraphData>(
    graphData: G
): ComponentGraphData<G> {
    const uf = new UnionFind();

    // Add all nodes to Union-Find
    for (const taskId of Object.keys(graphData.tasks)) {
        uf.add(taskId);
    }

    // Union nodes connected by edges
    for (const dep of Object.values(graphData.dependencies)) {
        uf.union(dep.data.prerequisite_task_id, dep.data.dependent_task_id);
    }

    // Map root IDs to sequential component IDs
    const rootToComponentId = new Map<string, number>();
    let nextComponentId = 0;

    const tasks: ComponentGraphData<G>["tasks"] = {} as ComponentGraphData<G>["tasks"];

    for (const [taskId, taskWrapper] of Object.entries(graphData.tasks)) {
        const root = uf.find(taskId);
        let componentId = rootToComponentId.get(root);
        if (componentId === undefined) {
            componentId = nextComponentId++;
            rootToComponentId.set(root, componentId);
        }
        (tasks as Record<string, unknown>)[taskId] = {
            ...taskWrapper,
            componentId,
        };
    }

    return {
        tasks,
        dependencies: graphData.dependencies,
    } as ComponentGraphData<G>;
}
