// Receives TaskOut from API, and nests the node / edge data by one level, so we can add additional metadata later.

import { TaskListOut } from "todo-client/dist/client";

export interface NestedGraphData {
    tasks: {
        [key: string]: {
            data: TaskListOut["tasks"][string];
            // Future metadata fields can be added here
        };
    };
    dependencies: {
        [key: string]: {
            data: TaskListOut["dependencies"][string];
            // Future metadata fields can be added here
        };
    };
}

export function nestGraphData(taskList: TaskListOut): NestedGraphData {
    const nestedTasks: NestedGraphData["tasks"] = {};
    for (const [taskId, taskData] of Object.entries(taskList.tasks)) {
        nestedTasks[taskId] = { data: taskData };
    }

    const nestedDependencies: NestedGraphData["dependencies"] = {};
    for (const [depId, depData] of Object.entries(taskList.dependencies)) {
        nestedDependencies[depId] = { data: depData };
    }

    return {
        tasks: nestedTasks,
        dependencies: nestedDependencies,
    };
}

// Generic type to extend NestedGraphData with additional properties on nodes and edges
export type ExtendNestedGraphData<TNodeExtra = {}, TEdgeExtra = {}, G extends NestedGraphData = NestedGraphData> = {
    tasks: {
        [K in keyof G["tasks"]]: G["tasks"][K] & TNodeExtra;
    };
    dependencies: {
        [K in keyof G["dependencies"]]: G["dependencies"][K] & TEdgeExtra;
    };
};