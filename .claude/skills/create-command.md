# Create Command Skill

Use this skill when asked to create a new command for the commander module.

## Quick Start

1. Create a new file in `src/commander/commands/<command-name>.ts`
2. Export a `CommandDefinition` and register it
3. Add the export to `src/commander/commands/index.ts`

## Command Definition Interface

```typescript
interface CommandDefinition {
  name: string;              // Primary command name
  description: string;       // Shown in help/completions
  aliases?: string[];        // Alternative names
  positionals?: PositionalDefinition[];
  options?: OptionDefinition[];
  handler: (args: ParsedArgs) => void | Promise<void>;
}

interface PositionalDefinition {
  name: string;
  description: string;
  required?: boolean;
  complete?: (partial: string, context: CompletionContext) => string[];
}

interface OptionDefinition {
  name: string;              // --name
  alias?: string;            // -n
  description: string;
  type: 'string' | 'boolean' | 'number';
  required?: boolean;
  default?: unknown;
  complete?: (partial: string, context: CompletionContext) => string[];
}

interface ParsedArgs {
  _: string[];               // Positional arguments
  [key: string]: unknown;    // Named options
}
```

## Template

```typescript
// src/commander/commands/mycommand.ts
import { CommandDefinition } from '../types';
import { commandRegistry } from '../CommandRegistry';
import { output } from '../output';
import { useTodoStore } from '../../stores/todoStore';

const myCommand: CommandDefinition = {
  name: 'mycommand',
  description: 'Does something useful',
  aliases: ['mc'],
  positionals: [
    {
      name: 'target',
      description: 'The target to operate on',
      required: true,
      complete: (partial) => {
        // Return matching task IDs for completion
        const graphData = useTodoStore.getState().graphData;
        if (!graphData) return [];
        return Object.keys(graphData.tasks)
          .filter(id => id.startsWith(partial));
      },
    },
  ],
  options: [
    {
      name: 'force',
      alias: 'f',
      description: 'Force the operation',
      type: 'boolean',
      default: false,
    },
    {
      name: 'count',
      alias: 'c',
      description: 'Number of times',
      type: 'number',
      default: 1,
    },
  ],
  handler: async (args) => {
    const target = args._[0];
    const force = args.force as boolean;
    const count = args.count as number;

    if (!target) {
      output.error('target is required');
      return;
    }

    // Get API client from store
    const { api } = useTodoStore.getState();
    if (!api) {
      output.error('not connected');
      return;
    }

    try {
      // Do something with the API
      // await api.someEndpoint({ ... });
      output.info(`Executed mycommand on ${target}`);
    } catch (err) {
      output.error(`Failed: ${err instanceof Error ? err.message : err}`);
    }
  },
};

export function registerMyCommand() {
  commandRegistry.register(myCommand);
}
```

## Register in Index

Add to `src/commander/commands/index.ts`:

```typescript
import { registerMyCommand } from './mycommand';

export function registerBuiltinCommands() {
  // ... existing registrations
  registerMyCommand();
}
```

## Output Helpers

Use the `output` module for user feedback:

```typescript
import { output } from '../output';

output.info('Informational message');    // Neutral
output.success('Operation succeeded');   // Green
output.error('Something went wrong');    // Red
output.warn('Warning message');          // Yellow
```

## Accessing App State

```typescript
import { useTodoStore } from '../../stores/todoStore';

// Get current state (non-reactive, for commands)
const { graphData, cursor, api } = useTodoStore.getState();

// Modify state
useTodoStore.getState().setCursor('node-id');
useTodoStore.getState().setNavigationMode('manual');
```

## Common Patterns

### Task ID Completion

```typescript
complete: (partial) => {
  const graphData = useTodoStore.getState().graphData;
  if (!graphData) return [];
  return Object.keys(graphData.tasks)
    .filter(id => id.toLowerCase().startsWith(partial.toLowerCase()));
},
```

### Using Current Cursor as Default

```typescript
handler: async (args) => {
  const target = args._[0] || useTodoStore.getState().cursor;
  if (!target) {
    output.error('No target specified and no cursor selected');
    return;
  }
  // ...
},
```

### API Calls with Error Handling

```typescript
handler: async (args) => {
  const { api } = useTodoStore.getState();
  if (!api) {
    output.error('Not connected to server');
    return;
  }

  try {
    await api.someMethod({ param: args._[0] });
    output.success('Done');
  } catch (err) {
    if (err instanceof Error) {
      output.error(err.message);
    } else {
      output.error('Unknown error');
    }
  }
},
```

## Example Commands to Reference

| Command | File | Good example of |
|---------|------|-----------------|
| `goto` | `commands/goto.ts` | Simple cursor manipulation |
| `add` | `commands/add.ts` | API call with options |
| `link` | `commands/link.ts` | Two positionals, cursor fallback |
| `flip` | `commands/flip.ts` | Complex logic, multiple API calls |
| `status` | `commands/status.ts` | Read-only display command |
| `connect` | `commands/connect.ts` | Store manipulation |
| `setnavmode` | `commands/setnavmode.ts` | Enum completion |

## Checklist

- [ ] Created `src/commander/commands/<name>.ts`
- [ ] Defined `CommandDefinition` with name, description, handler
- [ ] Added positionals/options if needed
- [ ] Implemented completion functions for better UX
- [ ] Used `output.*` for user feedback
- [ ] Handled errors gracefully
- [ ] Exported register function
- [ ] Added to `commands/index.ts`
