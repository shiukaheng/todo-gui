import { TaskListOut } from 'todo-client';
import { GraphData, GraphNode, GraphEdge } from '@/types/GraphData';

/** Special ID for the virtual root node that connects all top-level nodes */
export const ROOT_NODE_ID = '__root__';

/**
 * Converts TaskListOut from the todo-client API to the internal GraphData format.
 * This preserves compatibility with existing visualization and physics code.
 *
 * Adds a virtual root node that connects to all top-level nodes (nodes with no parents).
 * This root node has id ROOT_NODE_ID and should not be rendered.
 */
export function convertTaskListToGraphData(taskList: TaskListOut): GraphData {
    // Debug: log raw API data to understand structure
    console.log('[convertTaskListToGraphData] Raw API data:', {
        tasks: Object.values(taskList.tasks).map(t => ({
            id: t.id,
            text: t.text,
            parents: t.parents,
            children: t.children,
        })),
        dependencies: Object.values(taskList.dependencies).map(d => ({
            id: d.id,
            fromId: d.fromId,
            toId: d.toId,
        })),
    });

    // Convert tasks to nodes
    const nodes: GraphNode[] = Object.values(taskList.tasks).map(task => ({
        id: task.id,
        data: {
            id: task.id,
            text: task.text,
            completed: task.completed,
            inferred: task.inferred,
            due: task.due,
            created_at: task.createdAt,
            updated_at: task.updatedAt,
            calculated_completed: task.calculatedCompleted,
            calculated_due: task.calculatedDue,
            deps_clear: task.depsClear,
            // Store parent/child task IDs (resolved from dependency IDs)
            // Dependency: fromId depends on toId (fromId is the parent goal, toId is the subtask)
            // parents = high-level goals that depend on this task (fromId of deps where this is toId)
            // children = sub-tasks this depends on (toId of deps where this is fromId)
            parentIds: task.parents.map(depId => taskList.dependencies[depId]?.fromId).filter(Boolean),
            childIds: task.children.map(depId => taskList.dependencies[depId]?.toId).filter(Boolean),
        }
    }));

    // Convert dependencies to edges
    const edges: GraphEdge[] = Object.values(taskList.dependencies).map(dep => ({
        id: dep.id,
        source: dep.fromId,
        target: dep.toId,
        data: {
            type: 'DEPENDS_ON',
        }
    }));

    // Find top-level nodes (no parents = nothing depends on them completing)
    // These are the high-level goals at the top of the task hierarchy
    const topLevelNodeIds = nodes
        .filter(node => node.data.parentIds.length === 0)
        .map(node => node.id);

    // Add virtual root node with childIds pointing to all top-level nodes
    const rootNode: GraphNode = {
        id: ROOT_NODE_ID,
        data: {
            id: ROOT_NODE_ID,
            text: 'Root',
            isVirtualRoot: true,
            parentIds: [],
            childIds: topLevelNodeIds,
        }
    };
    nodes.push(rootNode);

    // Update top-level nodes to have root as their parent
    for (const node of nodes) {
        if (topLevelNodeIds.includes(node.id)) {
            node.data.parentIds = [ROOT_NODE_ID];
        }
    }

    // Add edges from root to all top-level nodes
    topLevelNodeIds.forEach(nodeId => {
        edges.push({
            id: `${ROOT_NODE_ID}->${nodeId}`,
            source: ROOT_NODE_ID,
            target: nodeId,
            data: {
                type: 'ROOT_EDGE',
                isVirtualRootEdge: true,
            }
        });
    });

    const result = { nodes, edges };

    console.log('[convertTaskListToGraphData] GraphData:', {
        nodeCount: nodes.length,
        nodeIds: nodes.map(n => n.id),
        edgeCount: edges.length,
        topLevelNodes: topLevelNodeIds,
    });

    return result;
}
