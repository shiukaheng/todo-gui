/**
 * Unhide command - remove nodes from the blacklist, or clear it entirely.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const unhideCommand: CommandDefinition = {
    name: 'unhide',
    description: 'Unhide nodes (or all if no args)',
    positionals: [
        {
            name: 'nodeIds',
            description: 'Node IDs to unhide (clears all if omitted)',
            required: false,
            complete: (partial) => {
                const blacklist = useTodoStore.getState().blacklistNodeIds;
                if (!blacklist) return [];
                return blacklist.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const { blacklistNodeIds, setBlacklist, clearBlacklist } = useTodoStore.getState();

        if (!blacklistNodeIds || blacklistNodeIds.length === 0) {
            output.error('no nodes are hidden');
            return;
        }

        const nodeIds = args._ as string[];

        let newBlacklist: string[];
        if (nodeIds.length === 0) {
            // Clear entire blacklist
            clearBlacklist();
            newBlacklist = [];
        } else {
            // Remove specific nodes from blacklist
            const toRemove = new Set(nodeIds);
            newBlacklist = blacklistNodeIds.filter(id => !toRemove.has(id));
            if (newBlacklist.length === 0) {
                clearBlacklist();
            } else {
                setBlacklist(newBlacklist);
            }
        }

        // Persist to server
        const { api, currentViewId } = useTodoStore.getState();
        if (api) {
            api.displayBatch({
                displayBatchRequest: {
                    operations: [{
                        op: 'update_view',
                        viewId: currentViewId,
                        blacklist: newBlacklist,
                    }],
                },
            }).catch(err => {
                console.error('Failed to persist blacklist:', err);
            });
        }

        if (nodeIds.length === 0) {
            output.success('all nodes unhidden');
        } else {
            output.success(`unhidden: ${nodeIds.join(', ')}`);
        }
    },
};
