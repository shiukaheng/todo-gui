/**
 * Renameview command - rename a display view by creating a copy and deleting the old one.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const renameviewCommand: CommandDefinition = {
    name: 'renameview',
    description: 'Rename a display view',
    positionals: [
        {
            name: 'oldId',
            description: 'Current view ID',
            required: true,
            complete: (partial) => {
                const viewsData = useTodoStore.getState().viewsData;
                if (!viewsData?.views) return [];
                return Object.keys(viewsData.views).filter(id =>
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

        const { api, viewsData } = useTodoStore.getState();

        if (!api) {
            output.error('not connected to server');
            return;
        }

        const oldView = viewsData?.views?.[oldId];
        if (!oldView) {
            output.error(`view not found: ${oldId}`);
            return;
        }

        if (viewsData?.views?.[newId]) {
            output.error(`view already exists: ${newId}`);
            return;
        }

        try {
            // Create new view with old view's data, then delete old view
            const viewAny = oldView as any;
            const ops: any[] = [
                {
                    op: 'update_view',
                    viewId: newId,
                    includeRecursive: viewAny.includeRecursive ?? [],
                    excludeRecursive: viewAny.excludeRecursive ?? [],
                    hideCompletedFor: viewAny.hideCompletedFor ?? null,
                },
                { op: 'delete_view', id: oldId },
            ];

            await api.displayBatch({
                displayBatchRequest: { operations: ops },
            });

            output.success(`renamed view: ${oldId} → ${newId}`);
        } catch (err) {
            output.error(`failed to rename view: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
