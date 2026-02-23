/**
 * Merge command - merge one node into another, transferring all edges.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';
import type { BatchOperation } from 'todo-client';

export const mergeCommand: CommandDefinition = {
    name: 'merge',
    description: 'Merge a node into another: edges transfer, original deleted',
    aliases: [],
    positionals: [
        {
            name: 'from',
            description: 'Node to merge from (will be deleted)',
            required: true,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];
                return Object.keys(graphData.tasks).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
        {
            name: 'to',
            description: 'Node to merge into (will receive edges)',
            required: true,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];
                return Object.keys(graphData.tasks).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    options: [
        {
            name: 'children',
            alias: 'c',
            description: 'Only transfer children (outgoing edges)',
            type: 'boolean',
            default: false,
        },
        {
            name: 'parents',
            alias: 'p',
            description: 'Only transfer parents (incoming edges)',
            type: 'boolean',
            default: false,
        },
    ],
    handler: async (args) => {
        const { api, graphData, cursor, setCursor } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        if (!graphData?.tasks) {
            output.error('no graph data available');
            return;
        }

        const fromId = args._[0] as string | undefined;
        const toId = args._[1] as string | undefined;

        if (!fromId || !toId) {
            output.error('usage: merge <from> <to>');
            return;
        }

        if (!graphData.tasks[fromId]) {
            output.error(`node not found: ${fromId}`);
            return;
        }
        if (!graphData.tasks[toId]) {
            output.error(`node not found: ${toId}`);
            return;
        }
        if (fromId === toId) {
            output.error('cannot merge a node into itself');
            return;
        }

        const deps = Object.values(graphData.dependencies || {});

        // If neither flag is set, transfer both directions (default)
        const keepChildren = !!args.children;
        const keepParents = !!args.parents;
        const transferChildren = !keepParents || keepChildren;  // outgoing
        const transferParents = !keepChildren || keepParents;    // incoming

        // Find existing edges on toNode to avoid duplicates
        const toOutgoing = new Set(deps.filter(d => d.fromId === toId).map(d => d.toId));
        const toIncoming = new Set(deps.filter(d => d.toId === toId).map(d => d.fromId));

        const operations: BatchOperation[] = [];

        // Collect edges to transfer
        const newOutgoing: { fromId: string; toId: string }[] = [];
        const newIncoming: { fromId: string; toId: string }[] = [];

        // Outgoing (children): fromNode depends on X → toNode depends on X
        if (transferChildren) {
            for (const dep of deps) {
                if (dep.fromId === fromId) {
                    const target = dep.toId;
                    if (target === toId || toOutgoing.has(target)) continue;
                    newOutgoing.push({ fromId: toId, toId: target });
                    toOutgoing.add(target);
                }
            }
        }

        // Incoming (parents): X depends on fromNode → X depends on toNode
        if (transferParents) {
            for (const dep of deps) {
                if (dep.toId === fromId) {
                    const source = dep.fromId;
                    if (source === toId || toIncoming.has(source)) continue;
                    newIncoming.push({ fromId: source, toId: toId });
                    toIncoming.add(source);
                }
            }
        }

        // Order matters: unlink old edges first so transitive reduction
        // doesn't remove the new edges as redundant
        for (const dep of deps) {
            if (dep.fromId === fromId || dep.toId === fromId) {
                operations.push({ op: 'unlink', fromId: dep.fromId, toId: dep.toId });
            }
        }

        // Then create new edges (no old paths exist to confuse transitive reduction)
        for (const edge of newOutgoing) {
            operations.push({ op: 'link', ...edge });
        }
        for (const edge of newIncoming) {
            operations.push({ op: 'link', ...edge });
        }

        // Finally delete the now-isolated node
        operations.push({ op: 'delete_node', id: fromId });

        try {
            await api.batch({
                batchRequest: { operations },
            });

            const edgeCount = newOutgoing.length + newIncoming.length;
            output.success(`merged ${fromId} into ${toId} (${edgeCount} edge(s) transferred)`);

            // Move cursor to toNode if it was on the deleted node
            if (cursor === fromId) {
                setCursor(toId);
            }
        } catch (err) {
            output.error(`failed to merge: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
