/**
 * Setcompletedcullfilter command - set or disable the hide-completed-for duration.
 * Modifies the local filter via setFilter(); no server calls.
 */

import { CommandDefinition } from '../types';
import { useTodoStore } from '../../stores/todoStore';
import { output } from '../output';

export const setcompletedcullfilterCommand: CommandDefinition = {
    name: 'setcompletedcullfilter',
    description: 'Set or disable the hide-completed-for filter (seconds)',
    aliases: ['sccf'],
    positionals: [
        {
            name: 'seconds',
            description: 'Seconds to hide completed nodes for, or "disable"/"off" to clear',
            required: true,
        },
    ],
    handler: (args) => {
        const arg = args._[0] as string | undefined;

        if (!arg) {
            output.error('usage: setcompletedcullfilter <seconds>|"disable"');
            return;
        }

        const { filter, setFilter } = useTodoStore.getState();

        if (arg === 'disable' || arg === 'off') {
            setFilter({ ...filter, hideCompletedFor: null });
            output.success('hideCompletedFor disabled');
            return;
        }

        const seconds = parseInt(arg, 10);
        if (isNaN(seconds) || seconds < 0) {
            output.error(`invalid seconds value: ${arg}`);
            return;
        }

        setFilter({ ...filter, hideCompletedFor: seconds });
        output.success(`hideCompletedFor set: ${seconds}s`);
    },
};
