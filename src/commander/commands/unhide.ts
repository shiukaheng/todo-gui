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
                const hideList = useTodoStore.getState().hideNodeIds;
                if (!hideList) return [];
                return hideList.filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const { hideNodeIds, setHide, clearHide } = useTodoStore.getState();

        if (!hideNodeIds || hideNodeIds.length === 0) {
            output.error('no nodes are hidden');
            return;
        }

        const nodeIds = args._ as string[];

        let newHideList: string[];
        if (nodeIds.length === 0) {
            // Clear entire hide list
            clearHide();
            newHideList = [];
        } else {
            // Remove specific nodes from hide list
            const toRemove = new Set(nodeIds);
            newHideList = hideNodeIds.filter(id => !toRemove.has(id));
            if (newHideList.length === 0) {
                clearHide();
            } else {
                setHide(newHideList);
            }
        }

        // Persist to server
        const { api, activeView } = useTodoStore.getState();
        if (api) {
            api.displayBatch({
                displayBatchRequest: {
                    operations: [{
                        op: 'update_view',
                        view_id: activeView,
                        blacklist: newHideList,
                    } as any],
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
