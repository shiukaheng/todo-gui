# Task: Minimal WebCola Plotting

## Goal
Integrate WebCola as the graph layout engine, replacing the dummy circular layout with constraint-based positioning that produces cleaner, more readable task dependency graphs.

## Context
- Branch: `minimal-cola-plotting`
- Worktree: `../todo-gui-minimal-cola`
- The new architecture in `src/new_components/` has a `SimulationModule` interface ready for pluggable layouts
- Currently using `DummySimulationModule` which just places nodes in a circle

## SimulationModule Interface (from GraphViewerEngine.ts)
```typescript
interface SimulationModule {
    calculate(data: MinimalGraph): GraphSpatialState;
    saveState(): GraphSpatialState;
    loadState(state: GraphSpatialState): void;
}

type MinimalGraph = {
    nodes: string[];
    edges: [string, string][];
};

type GraphSpatialState = {
    positions: Record<string, { x: number; y: number }>;
};
```

## Tasks

### Phase 1: Basic WebCola Integration
- [ ] Install webcola package (`npm install webcola` or `yarn add webcola`)
- [ ] Create `ColaSimulationModule.ts` implementing `SimulationModule`
- [ ] Wire it up in `GraphViewerEngine` instead of `DummySimulationModule`
- [ ] Verify graph renders with cola-computed positions

### Phase 2: Make it Work Well
- [ ] Handle incremental updates (new nodes/edges without full re-layout)
- [ ] Preserve positions when data changes (`saveState`/`loadState`)
- [ ] Tune cola parameters for task dependency graphs (flow direction, spacing)

### Phase 3: Animation (Optional)
- [ ] Animate layout transitions smoothly
- [ ] Consider whether cola should run continuously or settle-then-stop

## Notes
- WebCola docs: https://ialab.it.monash.edu/webcola/
- Cola can do constraint-based layout (align nodes, flow direction) which is better for DAGs than pure force-directed
- The `addSpatialData()` method in GraphViewerEngine is not yet implemented - may need to finish that

## Current Blockers
- None identified yet

---
Last updated: 2026-02-02
