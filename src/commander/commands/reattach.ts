/**
 * Reattach command - move a node from its current parent to a new parent.
 * Only works if the node has 0 or 1 parent. Detaches from old parent (if any)
 * and attaches to the new one.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';
import type { BatchOperation } from 'todo-client';

export const reattachCommand: CommandDefinition = {
    name: 'reattach',
    description: 'Reattach a node to a new parent: reattach [node] <newParent>',
    aliases: ['ra'],
    positionals: [
        {
            name: 'arg1',
            description: 'Node to reattach (if 2 args) or new parent (if 1 arg, uses cursor)',
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
            name: 'arg2',
            description: 'New parent (when node is specified explicitly)',
            required: false,
            complete: (partial) => {
                const graphData = useTodoStore.getState().graphData;
                if (!graphData?.tasks) return [];
                return Object.keys(graphData.tasks).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: async (args) => {
        const { api, graphData, cursor } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        if (!graphData?.tasks) {
            output.error('no graph data available');
            return;
        }

        // Parse args: reattach <newParent> (cursor) or reattach <node> <newParent>
        let nodeId: string;
        let newParentId: string;

        if (args._.length >= 2) {
            nodeId = args._[0] as string;
            newParentId = args._[1] as string;
        } else if (args._.length === 1) {
            if (!cursor) {
                output.error('no cursor set; specify node explicitly: reattach <node> <newParent>');
                return;
            }
            nodeId = cursor;
            newParentId = args._[0] as string;
        } else {
            output.error('usage: reattach [node] <newParent>');
            return;
        }

        // Validate nodes exist
        if (!graphData.tasks[nodeId]) {
            output.error(`node not found: ${nodeId}`);
            return;
        }
        if (!graphData.tasks[newParentId]) {
            output.error(`new parent not found: ${newParentId}`);
            return;
        }
        if (nodeId === newParentId) {
            output.error('cannot reattach a node to itself');
            return;
        }

        // Find current parents of node
        // Edge semantics: fromId depends on toId (fromId=dependent/parent, toId=blocker/child)
        // "Parent" in navigation = fromId where toId === nodeId
        const deps = Object.values(graphData.dependencies || {});
        const parents = deps.filter(d => d.toId === nodeId).map(d => d.fromId);

        if (parents.length > 1) {
            output.error(`node ${nodeId} has ${parents.length} parents (${parents.join(', ')}); reattach only works with 0 or 1 parent`);
            return;
        }

        const oldParentId = parents.length === 1 ? parents[0] : null;

        // Check if already attached to the target
        if (oldParentId === newParentId) {
            output.error(`node ${nodeId} is already attached to ${newParentId}`);
            return;
        }

        try {
            const operations: BatchOperation[] = [];
            // Detach from old parent (if any)
            if (oldParentId) {
                operations.push({ op: 'unlink', fromId: oldParentId, toId: nodeId });
            }
            // Attach to new parent
            operations.push({ op: 'link', fromId: newParentId, toId: nodeId });

            await api.batch({
                batchRequest: { operations },
            });

            if (oldParentId) {
                output.success(`reattached ${nodeId}: ${oldParentId} → ${newParentId}`);
            } else {
                output.success(`attached ${nodeId} to ${newParentId}`);
            }
        } catch (err) {
            output.error(`failed to reattach: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
