import { TaskListOut } from 'todo-client';
import { GraphData, GraphNode, GraphEdge } from '@/types/GraphData';

/**
 * Converts TaskListOut from the todo-client API to the internal GraphData format.
 * This preserves compatibility with existing visualization and physics code.
 */
export function convertTaskListToGraphData(taskList: TaskListOut): GraphData {
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

    const result = { nodes, edges };

    console.log('[convertTaskListToGraphData] GraphData:', {
        nodeCount: nodes.length,
        nodeIds: nodes.map(n => n.id),
        edgeCount: edges.length,
    });

    return result;
}
