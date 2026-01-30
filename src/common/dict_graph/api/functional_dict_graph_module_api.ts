import { DictGraphModule } from '../DictGraphModule';

/**
 * Create an empty graph content.
 */
export function createModule<T>(): DictGraphModule<T> {
    return {};
}

export function cloneModule<T>(content: DictGraphModule<T>): DictGraphModule<T> {
    return { ...content };
}

export function mergeModule<T>(...contents: DictGraphModule<T>[]): DictGraphModule<T> {
    return Object.assign({}, ...contents);
}

export function setModuleNode<T>(content: DictGraphModule<T>, id: string, data: T): void {
    content[id] = data;
}

export function getModuleNode<T>(content: DictGraphModule<T>, id: string): T {
    const nodeData = content[id];
    if (nodeData === undefined) {
        throw new Error(`Node with id ${id} not found`);
    }
    return nodeData;
}

export  function deleteModuleNode<T>(content: DictGraphModule<T>, id: string): void {
    delete content[id];
}

export function listModuleNodes<T>(content: DictGraphModule<T>): { id: string, data: T }[] {
    return Object.entries(content).map(([id, data]) => ({ id, data }));
}

export function hasModuleNode<T>(content: DictGraphModule<T>, id: string): boolean {
    return id in content;
}

export function mutateModuleNode<T>(content: DictGraphModule<T>, id: string, mutator: (data: T) => T): void {
    content[id] = mutator(content[id]);
}

export function mutateModuleAllNodes<T>(content: DictGraphModule<T>, mutator: (id: string, data: T) => T): void {
    for (const id in content) {
        content[id] = mutator(id, content[id]);
    }
}