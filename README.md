# Todo GUI

A graph-based task visualization web app. Displays tasks and their dependencies as an interactive force-directed graph.

## Features

- **Graph visualization** - Tasks displayed as nodes with dependency edges
- **WebCola physics** - Constraint-based layout for readable task graphs
- **Keyboard navigation** - Navigate between tasks with arrow keys
- **Command palette** - Quick actions via command interface
- **Real-time updates** - SSE subscription to backend for live data

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at http://localhost:3000

## Build

```bash
npm run build
npm run preview  # preview production build
```

Output in `dist/`

## Commands

Open command palette with [Enter] and you can manipulate the graph with the following:

| Command | Aliases | Description |
|---------|---------|-------------|
| `status` | `st` | Show server connection status |
| `connect [url]` | `conn`, `reconnect` | Connect to server |
| `disconnect` | `disc` | Disconnect from server |
| `goto <id>` | `g` | Navigate to a task |
| `add <id>` | `a` | Add a new task |
| `remove <id>` | `rm`, `del` | Remove a task |
| `help` | `?` | Show available commands |

## Configuration

### API Server

Default server: `http://workstation.local:8000`

Change via the `connect` command:
```
connect http://localhost:8000
```

### Content Security Policy

The app requires relaxed CSP to connect to the API server. This is configured in `index.html`:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws: wss: bolt: bolt+s: bolt+ssc: neo4j: neo4j+s: neo4j+ssc: http: https:;">
```

For production deployments, consider tightening these rules or configuring CSP via server headers.

## Project Structure

```
src/
├── commander/       # Command palette system
│   ├── commands/    # Individual command definitions
│   └── ui/          # Command input UI
├── graph/           # Graph visualization
│   ├── navigation/  # Viewport navigation engines
│   ├── preprocess/  # Data transformation pipeline
│   ├── render/      # SVG rendering
│   └── simulation/  # Physics layout engines
├── stores/          # Zustand state management
├── shortcuts/       # Keyboard shortcut handling
└── renderer.tsx     # App entry point
```

## Documentation

See `/docs` for additional documentation:
- `schema.md` - Data model
- `FLOW.md` - Data flow architecture
- `STYLING.md` - Graph styling guide

## License

MIT
