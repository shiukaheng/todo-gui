/**
 * Renameview command - rename a display view by creating a copy and deleting the old one.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const renameviewCommand: CommandDefinition = {
    name: 'renameview',
    description: 'Rename a display view',
    aliases: ['rv'],
    positionals: [
        {
            name: 'oldId',
            description: 'Current view ID',
            required: true,
            complete: (partial) => {
                const displayData = useTodoStore.getState().displayData;
                if (!displayData?.views) return [];
                return Object.keys(displayData.views).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
        {
            name: 'newId',
            description: 'New view ID',
            required: true,
        },
    ],
    handler: async (args) => {
        const oldId = args._[0] as string | undefined;
        const newId = args._[1] as string | undefined;

        if (!oldId || !newId) {
            output.error('usage: renameview <oldId> <newId>');
            return;
        }

        if (oldId === newId) {
            output.error('old and new IDs are the same');
            return;
        }

        const { api, displayData, activeView, setActiveView } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        const oldView = displayData?.views?.[oldId];
        if (!oldView) {
            output.error(`view not found: ${oldId}`);
            return;
        }

        if (displayData?.views?.[newId]) {
            output.error(`view already exists: ${newId}`);
            return;
        }

        try {
            // Create new view with old view's data, then delete old view
            const ops: any[] = [
                { op: 'create_view', id: newId },
            ];

            // Copy positions
            if (oldView.positions && Object.keys(oldView.positions).length > 0) {
                ops.push({ op: 'update_positions', view_id: newId, positions: oldView.positions });
            }

            // Copy whitelist
            if (oldView.whitelist?.length) {
                ops.push({ op: 'set_whitelist', view_id: newId, node_ids: oldView.whitelist });
            }

            // Copy blacklist
            if (oldView.blacklist?.length) {
                ops.push({ op: 'set_blacklist', view_id: newId, node_ids: oldView.blacklist });
            }

            // Delete old view
            ops.push({ op: 'delete_view', id: oldId });

            await api.displayBatch({
                displayBatchRequest: { operations: ops },
            });

            // Switch active view if we renamed the current one
            if (activeView === oldId) {
                setActiveView(newId);
            }

            output.success(`renamed view: ${oldId} → ${newId}`);
        } catch (err) {
            output.error(`failed to rename view: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
