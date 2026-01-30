# Simplified Social Graph Viewer

## What Changed

This repository has been **drastically simplified** to be a pure graph visualization tool. The graph data now comes from Neo4j externally, so all the custom graph management code has been stripped out.

## New Architecture

### Core Components

1. **GraphData Type** (`src/types/GraphData.ts`)
   - Simple interface for graph input from Neo4j
   - Structure: `{ nodes: [{id}...], edges: [{source, target, weight}...] }`

2. **PhysicsSimulator** (`src/physics/PhysicsSimulator.ts`)
   - Standalone physics engine
   - Takes GraphData in, outputs node positions
   - Force-directed layout with spring forces + node repulsion
   - Smooth animation when user interacts

3. **SimpleGraphVisualizer** (`src/view/SimpleGraphVisualizer.ts`)
   - SVG renderer
   - Pan/zoom/drag interactions
   - Updates in real-time as physics runs

4. **SimpleGraphViewer** (`src/view/SimpleGraphViewer.tsx`)
   - Main React component that wires everything together
   - PhysicsSimulator → SimpleGraphVisualizer pipeline

5. **SimpleCommandPalette** (`src/view/SimpleCommandPalette.tsx`)
   - Minimal command palette (press Enter to open)
   - Currently only has `help` command
   - Structure preserved for future commands

## Removed Components

The following have been **removed/deprecated**:
- ❌ ProjectManager, GraphManager, ViewManager
- ❌ PinFilter (graph filtering/BFS traversal)
- ❌ Custom graph implementations (ArrayGraph, MatrixGraph)
- ❌ Graph APIs (functional_graph_api, objective_graph_api)
- ❌ Project/Views system (multiple views, pinned nodes, saved positions)
- ❌ File save/load functionality (.ig files)
- ❌ All command processing beyond 'help'

Old files are preserved with `.old.ts` extension for reference.

## How to Use

### Running the App

```bash
npm run start
```

### Setting Graph Data

The app exposes a global function for setting graph data:

```javascript
// Open browser console and run:
window.setGraphData({
  nodes: [
    { id: "alice" },
    { id: "bob" },
    { id: "charlie" }
  ],
  edges: [
    { source: "alice", target: "bob", weight: 1 },
    { source: "bob", target: "charlie", weight: 1 },
    { source: "charlie", target: "alice", weight: 0.5 }
  ]
});
```

### Interactions

- **Mouse Wheel**: Zoom in/out
- **Mouse Drag (background)**: Pan viewport
- **Mouse Drag (node)**: Move node (temporarily disables physics on that node)
- **Touch**: Pan and pinch-to-zoom supported
- **Enter Key**: Open command palette
- **Escape**: Close command palette

### Physics Controls

The physics simulator is accessible via browser console:

```javascript
// Access the simulator
window.physicsSimulator

// Trigger animation after graph change
window.physicsSimulator.registerInteraction()

// Adjust simulation parameters
window.physicsSimulator.simulationParameters.scalingConstant = 0.5
window.physicsSimulator.registerInteraction()
```

## Data Flow

```
Neo4j / External Source
    ↓
GraphData {nodes, edges}
    ↓
window.setGraphData()
    ↓
PhysicsSimulator
    ↓ (force calculations + position updates)
PhysicsState {spatialModule, simulationModule}
    ↓
SimpleGraphVisualizer
    ↓
SVG Rendering
```

## File Structure

```
src/
  types/
    GraphData.ts          # Simple graph data types
  physics/
    PhysicsSimulator.ts   # Physics engine
  view/
    SimpleGraphVisualizer.ts     # SVG renderer
    SimpleGraphViewer.tsx        # Main React component
    SimpleCommandPalette.tsx     # Minimal command UI
  index.ts                # Electron main process (simplified)
  preload.ts              # Electron preload (minimal)
  renderer.tsx            # React root
```

## What Remains from Original Architecture

These utilities are still used:
- `common/vector/*` - Vector math utilities
- `common/kd_tree/*` - KD-tree for efficient neighbor search
- `common/dict_graph/*` - Dictionary-based data structure for node positions
- `common/graph_physics/types.ts` - Physics simulation parameters
- `common/app_types/nodeTypes.ts` - SpatialNode, SimulationNode types

## Future Extensibility

The command palette structure is preserved for future commands. To add new commands:

1. Edit `SimpleGraphViewer.tsx` → `handleCommandRun` function
2. Parse command string and call appropriate methods
3. Access `physicsSimulatorRef.current` for physics control
4. Access `visualizerRef.current` for rendering control

## Development

The codebase is now **~90% smaller** in complexity:
- No complex reactive chains
- No multi-layer manager hierarchy  
- Direct data flow: Input → Physics → Render
- All state mutations go through PhysicsSimulator
- Single source of truth for graph data

This makes it easy to integrate with external data sources like Neo4j.
