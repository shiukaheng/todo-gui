/**
 * Loadview command - load filter from a named server view into the local filter.
 * Reads the view from the store and applies its filter fields locally.
 */

import { CommandDefinition } from '../types';
import { useTodoStore, deriveFilterFromView } from '../../stores/todoStore';
import { output } from '../output';

export const loadviewCommand: CommandDefinition = {
    name: 'loadview',
    description: 'Load filter from a named view into the local filter',
    aliases: ['lv'],
    positionals: [
        {
            name: 'name',
            description: 'Name of the view to load',
            required: true,
            complete: (partial) => {
                const viewsData = useTodoStore.getState().viewsData;
                if (!viewsData?.views) return [];
                return Object.keys(viewsData.views).filter(id =>
                    id.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const name = args._[0] as string | undefined;

        if (!name) {
            output.error('usage: loadview <name>');
            return;
        }

        const { viewsData, setFilter } = useTodoStore.getState();

        if (!viewsData?.views?.[name]) {
            output.error(`view not found: ${name}`);
            return;
        }

        const filter = deriveFilterFromView(viewsData, name);
        setFilter(filter);

        const parts: string[] = [];
        if (filter.includeRecursive) {
            parts.push(`include: ${filter.includeRecursive.join(', ')}`);
        }
        if (filter.excludeRecursive) {
            parts.push(`exclude: ${filter.excludeRecursive.join(', ')}`);
        }
        if (filter.hideCompletedFor != null) {
            parts.push(`hideCompleted: ${filter.hideCompletedFor}s`);
        }

        const detail = parts.length > 0 ? ` (${parts.join('; ')})` : ' (empty filter)';
        output.success(`loaded view: ${name}${detail}`);
    },
};
