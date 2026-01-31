# GraphProcessor - Node Dragging Feature

## How the Old System Works

### On mousedown (`GraphVisualizer.handleNodeMouseDown`)
1. Get the node's current **world position** from the spatial module
2. Convert to **screen coords** via `mapToSVGCoords(worldPos)`
3. Compute **offset** = `mouseScreenPos - nodeScreenPos`
   - This offset ensures the node doesn't "jump" to center on the cursor

### On mousemove (`GraphVisualizer.handleMouseMove`)
1. Compute `screenPos = mousePos - offset` (where node center should be)
2. Convert to **world coords** via `mapFromSVGCoords(screenPos)`
3. Emit **absolute world position** via `onNodeDrag(nodeId, worldPos)`

### On receiving drag event (`GraphViewer.tsx`)
```typescript
physicsSimulator.nodesToSkipSimulation.add(nodeId);  // pin node
physicsSimulator.setSpatialData(nodeId, { position: [x, y] });  // set absolute position
```

### On drop
```typescript
physicsSimulator.nodesToSkipSimulation.delete(nodeId);  // unpin node
```

## Key Insight
- Uses **absolute positions**, not deltas
- The offset trick prevents cursor-jump on grab
- Physics simulation is paused per-node via a Set (`nodesToSkipSimulation`)

## Requirements for New Architecture

### Coordinate Conversion Needs
1. **ViewTransform** - to convert screen ↔ world coords
2. **Current node position** - to compute offset on mousedown

### Where This Lives in New Architecture
- **SVGRenderer**: Just renders, no state, no transform storage
- **GraphProcessor**: Has `processedGraph` with current positions
- **UI Layer**: Has the ViewTransform, handles pointer events

### Proposed Solution
The **UI layer** (interaction controller) handles coordinate math since it has:
- Access to ViewTransform
- Access to `graphProcessor.processedGraph` for current positions

The **GraphProcessor** just needs two simple methods:
```typescript
abstract setNodePosition(nodeId: string, position: Vec2): void;  // pin + set absolute
abstract releaseNode(nodeId: string): void;                       // unpin
```

## Implementation Steps (TODO)
1. [ ] Add `setNodePosition` and `releaseNode` to `AbstractGraphProcessor`
2. [ ] Create an interaction controller that:
   - Listens to pointer events on root SVG
   - Uses `getHit()` helper to detect node hits (via `data-node-id`)
   - Stores offset on pointerdown
   - Converts screen → world coords on pointermove
   - Calls `graphProcessor.setNodePosition()`
   - Calls `graphProcessor.releaseNode()` on pointerup
3. [ ] Add `worldToScreen` and `screenToWorld` helpers to `rendererUtils.ts`
   - `worldToScreen` already exists
   - Need to add `screenToWorld` (inverse transform)

## Helper: Hit Detection (already noted in GPT convo)
```typescript
function getHit(e: PointerEvent): { kind: "node"; nodeId: string } | { kind: "edge"; edgeId: string } | null {
    const el = e.target as Element;
    const nodeEl = el.closest("g[data-node-id]") as SVGGElement | null;
    if (nodeEl) return { kind: "node", nodeId: nodeEl.dataset.nodeId! };

    const edgeEl = el.closest("[data-edge-id]") as SVGElement | null;
    if (edgeEl) return { kind: "edge", edgeId: edgeEl.dataset.edgeId! };

    return null;
}
```

## Helper: Screen to World (inverse transform)
```typescript
function screenToWorld(screen: Vec2, t: ViewTransform): Vec2 {
    const det = t.a * t.d - t.b * t.c;
    const dx = screen[0] - t.tx;
    const dy = screen[1] - t.ty;
    return [
        (t.d * dx - t.c * dy) / det,
        (-t.b * dx + t.a * dy) / det,
    ];
}
```
