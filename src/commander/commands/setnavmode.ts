/**
 * Setnavmode command - switch navigation mode (auto, manual, follow).
 */

import { CommandDefinition } from '../types';
import { useTodoStore, NavigationMode } from '../../stores/todoStore';
import { output } from '../output';

const VALID_MODES: NavigationMode[] = ['auto', 'manual', 'follow'];

export const setnavmodeCommand: CommandDefinition = {
    name: 'setnavmode',
    description: 'Switch navigation mode (auto, manual, follow)',
    aliases: ['snm', 'nav'],
    positionals: [
        {
            name: 'mode',
            description: 'Navigation mode: auto, manual, or follow',
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
        const currentMode = useTodoStore.getState().navigationMode;

        // No argument: show current mode
        if (!mode) {
            output.print(`navigation mode: ${currentMode}`);
            return;
        }

        // Validate mode
        if (!VALID_MODES.includes(mode as NavigationMode)) {
            output.error(`invalid mode: ${mode}. valid modes: ${VALID_MODES.join(', ')}`);
            return;
        }

        // Set mode
        useTodoStore.getState().setNavigationMode(mode as NavigationMode);
        output.success(`navigation mode: ${mode}`);
    },
};
