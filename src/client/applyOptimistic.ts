import type {
    AppState,
    ViewListOut,
    ViewOut,
    NodeOut,
    DependencyOut,
    BatchOperation,
    DisplayBatchOperation,
} from 'todo-client';
import { NodeType } from 'todo-client';

// ── Helpers ────────────────────────────────────────────────────────

function gateLogic(nodeType: NodeType, depValues: boolean[]): boolean {
    switch (nodeType) {
        case NodeType.Task:
        case NodeType.And:
            return !depValues.length || depValues.every(v => v);
        case NodeType.Or:
            return depValues.length > 0 && depValues.some(v => v);
        case NodeType.Not:
            return !depValues.some(v => v);
        case NodeType.ExactlyOne:
            return depValues.filter(v => v).length === 1;
        default:
            return true;
    }
}

function propagateCalculatedFields(s: AppState): void {
    if (s.hasCycles) return;

    // Build indexes
    // deps_fwd[fromId] = [toId, ...] (children = things I depend on)
    // deps_rev[toId] = [fromId, ...]  (parents = things that depend on me)
    const depsFwd: Record<string, string[]> = {};
    const depsRev: Record<string, string[]> = {};
    const parentsMap: Record<string, string[]> = {};   // nodeId -> dep IDs where node is toId
    const childrenMap: Record<string, string[]> = {};  // nodeId -> dep IDs where node is fromId

    for (const [depId, dep] of Object.entries(s.dependencies)) {
        if (!s.tasks[dep.fromId] || !s.tasks[dep.toId]) continue;
        (depsFwd[dep.fromId] ??= []).push(dep.toId);
        (depsRev[dep.toId] ??= []).push(dep.fromId);
        (parentsMap[dep.toId] ??= []).push(depId);
        (childrenMap[dep.fromId] ??= []).push(depId);
    }

    // Memoized calculatedValue (recursive down deps_fwd)
    const valueCache: Record<string, boolean> = {};
    function calcValue(nodeId: string): boolean {
        if (nodeId in valueCache) return valueCache[nodeId];
        const node = s.tasks[nodeId];
        const deps = (depsFwd[nodeId] ?? []).map(id => calcValue(id));
        const depsClear = gateLogic(node.nodeType, deps);
        const result = node.nodeType === NodeType.Task
            ? (node.completed != null) && depsClear
            : depsClear;
        valueCache[nodeId] = result;
        return result;
    }

    // Memoized calculatedDue (recursive up deps_rev)
    const dueCache: Record<string, number | null> = {};
    function calcDue(nodeId: string): number | null {
        if (nodeId in dueCache) return dueCache[nodeId];
        const node = s.tasks[nodeId];
        const dues: number[] = [];
        if (node.due) dues.push(node.due);
        for (const parentId of (depsRev[nodeId] ?? [])) {
            const parentDue = calcDue(parentId);
            if (parentDue != null) dues.push(parentDue);
        }
        const result = dues.length ? Math.min(...dues) : null;
        dueCache[nodeId] = result;
        return result;
    }

    // Compute all fields for each node
    for (const nodeId of Object.keys(s.tasks)) {
        const node = s.tasks[nodeId];
        const deps = (depsFwd[nodeId] ?? []).map(id => calcValue(id));
        const depsClear = gateLogic(node.nodeType, deps);
        s.tasks[nodeId] = {
            ...node,
            calculatedValue: calcValue(nodeId),
            calculatedDue: calcDue(nodeId),
            depsClear,
            isActionable: node.nodeType === NodeType.Task && node.completed == null && depsClear,
            parents: parentsMap[nodeId] ?? [],
            children: childrenMap[nodeId] ?? [],
        };
    }
}

// ── State batch ops ────────────────────────────────────────────────

export function applyBatchOps(state: AppState, ops: BatchOperation[]): AppState {
    // Deep-clone so we never mutate the original
    const s: AppState = {
        tasks: { ...state.tasks },
        dependencies: { ...state.dependencies },
        hasCycles: state.hasCycles,
        plans: { ...state.plans },
    };

    for (const op of ops) {
        switch (op.op) {
            case 'create_node':
                applyCreateNode(s, op);
                break;
            case 'update_node':
                applyUpdateNode(s, op);
                break;
            case 'delete_node':
                applyDeleteNode(s, op);
                break;
            case 'rename_node':
                applyRenameNode(s, op);
                break;
            case 'link':
                applyLink(s, op);
                break;
            case 'unlink':
                applyUnlink(s, op);
                break;
            case 'create_plan':
                applyCreatePlan(s, op);
                break;
            case 'update_plan':
                applyUpdatePlan(s, op);
                break;
            case 'delete_plan':
                applyDeletePlan(s, op);
                break;
            case 'rename_plan':
                applyRenamePlan(s, op);
                break;
        }
    }

    propagateCalculatedFields(s);
    return s;
}

function applyCreateNode(
    s: AppState,
    op: Extract<BatchOperation, { op: 'create_node' }>,
): void {
    const now = Math.floor(Date.now() / 1000);
    const node: NodeOut = {
        id: op.id,
        text: op.text ?? op.id,
        nodeType: op.nodeType ?? NodeType.Task,
        completed: op.completed ?? null,
        due: op.due ?? null,
        createdAt: now,
        updatedAt: now,
        calculatedValue: null,
        calculatedDue: null,
        depsClear: null,
        isActionable: null,
        parents: [],
        children: [],
    };
    s.tasks[op.id] = node;

    // Create dependency entries for depends/blocks
    if (op.depends) {
        for (const toId of op.depends) {
            addDependency(s, op.id, toId);
        }
    }
    if (op.blocks) {
        for (const fromId of op.blocks) {
            addDependency(s, fromId, op.id);
        }
    }
}

function applyUpdateNode(
    s: AppState,
    op: Extract<BatchOperation, { op: 'update_node' }>,
): void {
    const existing = s.tasks[op.id];
    if (!existing) return;
    s.tasks[op.id] = {
        ...existing,
        ...(op.text !== undefined && { text: op.text ?? existing.text }),
        ...(op.completed !== undefined && { completed: op.completed }),
        ...(op.nodeType !== undefined && op.nodeType !== null && { nodeType: op.nodeType }),
        ...(op.due !== undefined && { due: op.due }),
        updatedAt: Math.floor(Date.now() / 1000),
    };
}

function applyDeleteNode(
    s: AppState,
    op: Extract<BatchOperation, { op: 'delete_node' }>,
): void {
    delete s.tasks[op.id];
    // Remove all dependencies involving this node
    for (const [depId, dep] of Object.entries(s.dependencies)) {
        if (dep.fromId === op.id || dep.toId === op.id) {
            delete s.dependencies[depId];
        }
    }
}

function applyRenameNode(
    s: AppState,
    op: Extract<BatchOperation, { op: 'rename_node' }>,
): void {
    const existing = s.tasks[op.id];
    if (!existing) return;

    // Move task entry
    delete s.tasks[op.id];
    s.tasks[op.newId] = { ...existing, id: op.newId };

    // Update dependency references
    for (const [depId, dep] of Object.entries(s.dependencies)) {
        if (dep.fromId === op.id || dep.toId === op.id) {
            s.dependencies[depId] = {
                ...dep,
                fromId: dep.fromId === op.id ? op.newId : dep.fromId,
                toId: dep.toId === op.id ? op.newId : dep.toId,
            };
        }
    }
}

function applyLink(
    s: AppState,
    op: Extract<BatchOperation, { op: 'link' }>,
): void {
    addDependency(s, op.fromId, op.toId);
}

function applyUnlink(
    s: AppState,
    op: Extract<BatchOperation, { op: 'unlink' }>,
): void {
    for (const [depId, dep] of Object.entries(s.dependencies)) {
        if (dep.fromId === op.fromId && dep.toId === op.toId) {
            delete s.dependencies[depId];
            break;
        }
    }
}

function applyCreatePlan(
    s: AppState,
    op: Extract<BatchOperation, { op: 'create_plan' }>,
): void {
    const now = Math.floor(Date.now() / 1000);
    s.plans[op.id] = {
        id: op.id,
        text: op.text ?? null,
        createdAt: now,
        updatedAt: now,
        steps: op.steps ?? [],
    };
}

function applyUpdatePlan(
    s: AppState,
    op: Extract<BatchOperation, { op: 'update_plan' }>,
): void {
    const existing = s.plans[op.id];
    if (!existing) return;
    s.plans[op.id] = {
        ...existing,
        ...(op.text !== undefined && { text: op.text }),
        ...(op.steps !== undefined && { steps: op.steps ?? existing.steps }),
        updatedAt: Math.floor(Date.now() / 1000),
    };
}

function applyDeletePlan(
    s: AppState,
    op: Extract<BatchOperation, { op: 'delete_plan' }>,
): void {
    delete s.plans[op.id];
}

function applyRenamePlan(
    s: AppState,
    op: Extract<BatchOperation, { op: 'rename_plan' }>,
): void {
    const existing = s.plans[op.id];
    if (!existing) return;
    delete s.plans[op.id];
    s.plans[op.newId] = { ...existing, id: op.newId };
}

/** Helper: generate a synthetic dependency ID and insert it */
function addDependency(s: AppState, fromId: string, toId: string): void {
    const depId = `${fromId}->${toId}`;
    const dep: DependencyOut = {
        id: depId,
        fromId,
        toId,
        createdAt: Math.floor(Date.now() / 1000),
    };
    s.dependencies[depId] = dep;
}

// ── Display batch ops ──────────────────────────────────────────────

/**
 * Runtime shape for the `update_view` op used by commands via `as any`.
 * Not part of the generated DisplayBatchOperation union.
 */
interface UpdateViewRuntimeOp {
    op: 'update_view';
    view_id: string;
    whitelist?: string[];
    blacklist?: string[];
}

function isUpdateViewOp(op: any): op is UpdateViewRuntimeOp {
    return op && op.op === 'update_view' && typeof op.view_id === 'string';
}

function emptyView(id: string): ViewOut {
    return {
        id,
        positions: {},
        whitelist: [],
        blacklist: [],
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
    };
}

export function applyDisplayOps(state: ViewListOut, ops: DisplayBatchOperation[]): ViewListOut {
    const s: ViewListOut = {
        views: { ...state.views },
    };
    // Deep-clone individual views on first mutation
    const cloned = new Set<string>();
    function ensureCloned(viewId: string): ViewOut | undefined {
        const v = s.views[viewId];
        if (!v) return undefined;
        if (!cloned.has(viewId)) {
            s.views[viewId] = { ...v, positions: { ...v.positions } };
            cloned.add(viewId);
        }
        return s.views[viewId];
    }

    for (const raw of ops) {
        // Handle runtime update_view ops (used via `as any` in commands).
        // These are not part of the typed DisplayBatchOperation union.
        const rawAny = raw as any;
        if (isUpdateViewOp(rawAny)) {
            const viewId = rawAny.view_id;
            if (!s.views[viewId]) {
                s.views[viewId] = emptyView(viewId);
                cloned.add(viewId);
            }
            const view = ensureCloned(viewId)!;
            if (rawAny.whitelist !== undefined) view.whitelist = rawAny.whitelist;
            if (rawAny.blacklist !== undefined) view.blacklist = rawAny.blacklist;
            view.updatedAt = Math.floor(Date.now() / 1000);
            continue;
        }

        switch (raw.op) {
            case 'create_view':
                s.views[raw.id] = emptyView(raw.id);
                cloned.add(raw.id);
                break;

            case 'delete_view':
                delete s.views[raw.id];
                cloned.delete(raw.id);
                break;

            case 'set_whitelist': {
                const view = ensureCloned(raw.viewId);
                if (view) {
                    view.whitelist = [...raw.nodeIds];
                    view.updatedAt = Math.floor(Date.now() / 1000);
                }
                break;
            }

            case 'set_blacklist': {
                const view = ensureCloned(raw.viewId);
                if (view) {
                    view.blacklist = [...raw.nodeIds];
                    view.updatedAt = Math.floor(Date.now() / 1000);
                }
                break;
            }

            case 'update_positions': {
                const view = ensureCloned(raw.viewId);
                if (view) {
                    Object.assign(view.positions, raw.positions);
                    view.updatedAt = Math.floor(Date.now() / 1000);
                }
                break;
            }

            case 'remove_positions': {
                const view = ensureCloned(raw.viewId);
                if (view) {
                    for (const nodeId of raw.nodeIds) {
                        delete view.positions[nodeId];
                    }
                    view.updatedAt = Math.floor(Date.now() / 1000);
                }
                break;
            }
        }
    }

    return s;
}
