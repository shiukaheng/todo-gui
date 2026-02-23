/**
 * Resetview command - clear local filter buffer.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { EMPTY_FILTER } from '../../stores/filterTypes';
import { output } from '../output';

export const resetviewCommand: CommandDefinition = {
    name: 'resetview',
    aliases: ['rv'],
    description: 'Reset local filter (clear include, exclude, and completed cull)',
    handler: () => {
        const { filter, setFilter } = useTodoStore.getState();

        if (
            filter.includeRecursive === null &&
            filter.excludeRecursive === null &&
            filter.hideCompletedFor === null
        ) {
            output.error('filter already empty');
            return;
        }

        setFilter(EMPTY_FILTER);
        output.success('filter reset');
    },
};
