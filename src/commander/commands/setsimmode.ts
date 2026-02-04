/**
 * Setsimmode command - switch simulation engine (cola, force).
 */

import { CommandDefinition } from '../types';
import { useTodoStore, SimulationMode } from '../../stores/todoStore';
import { output } from '../output';

const VALID_MODES: SimulationMode[] = ['cola', 'force'];

export const setsimmodeCommand: CommandDefinition = {
    name: 'setsimmode',
    description: 'Switch simulation engine (cola, force)',
    aliases: ['ssm', 'sim'],
    positionals: [
        {
            name: 'mode',
            description: 'Simulation mode: cola or force',
            required: false,
            complete: (partial) => {
                return VALID_MODES.filter(m => 
                    m.toLowerCase().startsWith(partial.toLowerCase())
                );
            },
        },
    ],
    handler: (args) => {
        const mode = args._[0] as string | undefined;
        const currentMode = useTodoStore.getState().simulationMode;

        // No argument: show current mode
        if (!mode) {
            output.print(`simulation mode: ${currentMode}`);
            return;
        }

        // Validate mode
        if (!VALID_MODES.includes(mode as SimulationMode)) {
            output.error(`invalid mode: ${mode}. valid modes: ${VALID_MODES.join(', ')}`);
            return;
        }

        // Set mode
        useTodoStore.getState().setSimulationMode(mode as SimulationMode);
        output.success(`simulation mode: ${mode}`);
    },
};
