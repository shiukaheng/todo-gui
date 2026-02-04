# Codebase Overview Skill

Use this skill when asked to explain the codebase architecture or understand how modules interact.

## Architecture Summary

This is a **todo-gui** application - a graph-based task visualization tool built with:
- **React** + **TypeScript** for UI
- **Zustand** for global state
- **Vite** for bundling
- **Tailwind CSS** for styling
- **SVG** for graph rendering

The app connects to a backend via SSE (Server-Sent Events) to receive task data and renders it as an interactive node graph.

## Key Modules

### 1. Global State: `src/stores/todoStore.ts`
Zustand store holding:
- `graphData: TaskListOut | null` - Task data from server
- `cursor: string | null` - Currently selected node ID
- `navigationMode: 'auto' | 'manual' | 'follow'` - Viewport behavior
- `simulationMode: 'cola' | 'force'` - Layout algorithm
- `connectionStatus`, `baseUrl`, `api` - Backend connection state

Actions: `setCursor`, `setNavigationMode`, `setSimulationMode`, `subscribe(baseUrl)`, `disconnect()`

### 2. Commander Module: `src/commander/`
Terminal-style command system.

| File | Purpose |
|------|---------|
| `types.ts` | `CommandDefinition`, `ParsedArgs`, `CompletionSuggestion` |
| `CommandRegistry.ts` | Singleton registry, tokenization, completion, execution |
| `output.ts` | Output line store for command results |
| `commands/index.ts` | Registers all built-in commands |
| `commands/*.ts` | Individual commands (add, remove, link, goto, etc.) |
| `ui/CommandPlane.tsx` | Overlay UI triggered by Enter key |
| `ui/useCommandPlane.ts` | React hook for command plane state |

### 3. Simulation Module: `src/graph/simulation/`
Computes node positions (layout algorithms).

**Interface** (`types.ts`):
```typescript
interface SimulationEngine {
  step(input: SimulatorInput, prevState: SimulationState): SimulationState;
  pinNodes(pins: ReadonlyMap<string, PinStatus>): void;
  destroy?(): void;
}
```

**Engines** (`engines/`):
- `webColaEngine.ts` - Constraint-based layout (default, uses WebCola)
- `forceDirectedEngine.ts` - D3 force simulation
- `nullEngine.ts` - Passthrough (no layout)

### 4. Navigation Module: `src/graph/navigation/`
Handles viewport transform (pan/zoom/follow).

**Interface** (`types.ts`):
```typescript
interface NavigationEngine {
  step(input: NavigationEngineInput, prevState: NavigationState): NavigationState;
  destroy?(): void;
}

interface ViewTransform {
  a, b, c, d: number;  // 2x2 affine matrix
  tx, ty: number;      // translation
}
```

**Engines** (`engines/`):
- `autoNavigationEngine.ts` - Auto-fits all nodes in viewport
- `cursorFollowNavigationEngine.ts` - Smoothly follows cursor node
- `manualNavigationEngine.ts` - User-controlled pan/zoom with momentum
- `fitNavigationEngine.ts` - One-shot fit to bounds
- `staticNavigationEngine.ts` - No-op passthrough

### 5. Graph Viewer Engine: `src/graph/GraphViewerEngine.ts`
Imperative animation loop tying simulation + navigation + rendering.

**Loop (each frame):**
1. `simulationEngine.step()` → node positions
2. `updateCursorNeighbors()` → keyboard navigation data
3. `cursorStyleGraphData()` + `navigationStyleGraphData()` → visual styling
4. `navigationEngine.step()` → viewport transform
5. `renderer.render()` → SVG DOM updates

Subscribes to Zustand store and hot-swaps engines when modes change.

### 6. React Wrapper: `src/graph/GraphViewer.tsx`
- Mounts `GraphViewerEngine` via `useGraphViewerEngine` hook
- Handles keyboard events (arrows, numbers, Escape, Enter)
- Renders overlay panels: `ConnectionStatusPanel`, `NodeDetailOverlay`, `OutputPanel`, `CommandPlane`

### 7. Supporting Modules

| Path | Purpose |
|------|---------|
| `src/graph/render/SVGRenderer.ts` | DOM manipulation for graph rendering |
| `src/graph/input/` | Mouse/touch event handling |
| `src/graph/preprocess/` | Graph data transformations (nesting, styling) |
| `src/graph/graphNavigation/` | Keyboard cursor navigation logic |
| `src/components/` | Standalone UI panels |
| `src/utils/` | Utilities like `urgencyColor.ts` |

## Data Flow

```
Backend (SSE)
    ↓
todoStore.graphData
    ↓
GraphViewerEngine.setGraph()
    ↓
preprocessGraph() → ProcessedGraphData
    ↓
┌─────────────────────────────────────────┐
│ Animation Loop (requestAnimationFrame)  │
│                                         │
│  SimulationEngine.step() → positions    │
│           ↓                             │
│  Style functions → styled graph         │
│           ↓                             │
│  NavigationEngine.step() → transform    │
│           ↓                             │
│  SVGRenderer.render()                   │
└─────────────────────────────────────────┘
```

## Key Files to Read

For understanding specific areas:

- **State management**: `src/stores/todoStore.ts`
- **Main loop**: `src/graph/GraphViewerEngine.ts`
- **Command system**: `src/commander/CommandRegistry.ts`, `src/commander/commands/index.ts`
- **Layout algorithms**: `src/graph/simulation/engines/webColaEngine.ts`
- **Viewport control**: `src/graph/navigation/engines/manualNavigationEngine.ts`
- **Rendering**: `src/graph/render/SVGRenderer.ts`
