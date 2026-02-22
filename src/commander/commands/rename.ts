/**
 * Rename command - rename a task node's ID.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const renameCommand: CommandDefinition = {
    name: 'rename',
    description: 'Rename a task node',
    aliases: ['mv'],
    positionals: [
        {
            name: 'oldId',
            description: 'Current node ID (omit to rename cursor)',
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
            name: 'newId',
            description: 'New node ID',
            required: false,
            complete: () => [],
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

        // Parse args: rename <newId> (cursor) or rename <oldId> <newId>
        let oldId: string;
        let newId: string;

        if (args._.length >= 2) {
            oldId = args._[0] as string;
            newId = args._[1] as string;
        } else if (args._.length === 1) {
            if (!cursor) {
                output.error('no cursor set; specify node explicitly: rename <oldId> <newId>');
                return;
            }
            oldId = cursor;
            newId = args._[0] as string;
        } else {
            output.error('usage: rename [oldId] <newId>');
            return;
        }

        if (!graphData.tasks[oldId]) {
            output.error(`node not found: ${oldId}`);
            return;
        }

        if (oldId === newId) {
            output.error('old and new IDs are the same');
            return;
        }

        if (graphData.tasks[newId]) {
            output.error(`node already exists: ${newId}`);
            return;
        }

        try {
            await api.batchOperationsApiBatchPost({
                batchRequest: {
                    operations: [{ op: 'rename_node', id: oldId, newId }],
                },
            });
            output.success(`renamed: ${oldId} → ${newId}`);

            if (cursor === oldId) {
                setCursor(newId);
            }
        } catch (err) {
            output.error(`failed to rename: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
