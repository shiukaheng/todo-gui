# Frontend Command Palette Reference

Complete list of available commands in the todo app command palette.

## Task Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `add <text>` | `a`, `new` | Create a new task node |
| `remove <id>` | `rm` | Delete a task node |
| `rename <id> <new-id>` | `mv` | Rename a task node |
| `goto <id>` | `g`, `go` | Navigate to a task by ID |

## Dependencies & Relationships

| Command | Aliases | Description |
|---------|---------|-------------|
| `link <blocking> <dependent>` | `ln` | Create a dependency (blocking relationship) |
| `unlink <from> <to>` | `uln` | Remove a dependency link |
| `addblock <id>` | `ab` | Add a task that the cursor blocks (make it a child) |
| `adddep <id>` | `ad` | Add a dependency (blocker) to the cursor node |
| `flip <taskA> <taskB>` | `fl` | Flip dependency direction between two tasks |
| `merge <source> <target>` | - | Merge a node into another (edges transfer, original deleted) |

## Filters & Views

| Command | Aliases | Description |
|---------|---------|-------------|
| `setincludefilter <ids...>` | `sif` | Set include-recursive filter (whitelist tasks) |
| `addincludefilter <ids...>` | `aif` | Add node IDs to the include-recursive filter |
| `deleteincludefilter <ids...>` | `dif` | Remove node IDs from the include-recursive filter |
| `setexcludefilter <ids...>` | `sef` | Set exclude-recursive filter (blacklist tasks) |
| `addexcludefilter <ids...>` | `aef` | Add node IDs to the exclude-recursive filter |
| `deleteexcludefilter <ids...>` | `def` | Remove node IDs from the exclude-recursive filter |
| `setcompletedcullfilter <id>` | `sccf` | Set which tasks hide completed dependents |

## Display Views

| Command | Aliases | Description |
|---------|---------|-------------|
| `saveview <name>` | `sv` | Save current filter and positions to a named view |
| `loadview <name>` | `lv` | Load filter from a named view into local filter |
| `listviews` | - | List all available display views |
| `renameview <old> <new>` | - | Rename a display view |
| `deleteview <name>` | `dv` | Delete a display view |
| `resetview` | `rv` | Reset view to initial state |
| `savepos <view>` | `sp` | Save current node positions to a view |

## Plans

| Command | Aliases | Description |
|---------|---------|-------------|
| `addplan <plan-id>` | `ap` | Create a new plan with a sequence of tasks |
| `deleteplan <id>` | `dp` | Delete a plan |
| `renameplan <old> <new>` | `rp` | Rename a plan |
| `pushtoplan <plan-id>` | `ptp` | Add cursor task to a plan |
| `popfromplan <plan-id>` | `pfp` | Remove last node from a plan |

## Navigation & Display

| Command | Aliases | Description |
|---------|---------|-------------|
| `setnavmode <mode>` | `snm`, `nav` | Set navigation mode: auto, manual, follow, or fly |
| `setsimmode <mode>` | `ssm`, `sim` | Set simulation mode: cola or force |

## Connection & Utility

| Command | Aliases | Description |
|---------|---------|-------------|
| `connect <url>` | `conn`, `reconnect` | Connect to server (reconnects if already connected) |
| `reattach` | `ra` | Reconnect to the last connected server |
| `status` | `st` | Show connection status and statistics |
| `help [command]` | `?` | Show available commands or help for specific command |
| `echo <text>` | `say` | Echo back the provided message |

## Notes

- **Cursor**: The currently selected/focused task in the graph
- **Include-recursive**: Whitelist filter - only show these tasks and their dependencies
- **Exclude-recursive**: Blacklist filter - hide these tasks and their dependents
- **Navigation Modes**: `auto` (default), `manual` (static), `follow` (center on cursor), `fly` (animated)
- **Simulation Modes**: `cola` (better layout), `force` (physics-based)
- **Views**: Named configurations combining filter state and node positions
