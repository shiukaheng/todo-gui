# Data Flow: Hardcoded Graph → Display

This document traces the complete data flow from the hardcoded star graph to what appears on screen.

---

## Step 1: Initial Graph Data 
📍 [SimpleGraphViewer.tsx](src/view/SimpleGraphViewer.tsx#L26-L41)

```typescript
const DUMMY_STAR_GRAPH: GraphData = {
    nodes: [
        { id: "center" }, { id: "node1" }, { id: "node2" }, 
        { id: "node3" }, { id: "node4" }
    ],
    edges: [
        { source: "center", target: "node1", weight: 1 },
        { source: "center", target: "node2", weight: 1 },
        { source: "center", target: "node3", weight: 1 },
        { source: "center", target: "node4", weight: 1 }
    ]
};

const [graphData, setGraphData] = useState<GraphData>(DUMMY_STAR_GRAPH);
```

**Data structure at this point:**
```
GraphData: just node IDs + edge connections
NO positions yet!
```

---

## Step 2: Component Mount & Initialization
📍 [SimpleGraphViewer.tsx](src/view/SimpleGraphViewer.tsx#L52-L61)

```typescript
useEffect(() => {
    // Create physics simulator with callback
    const physicsSimulator = new PhysicsSimulator((state) => {
        // This callback fires every frame with updated positions
        if (visualizerRef.current) {
            visualizerRef.current.updateState(graphData, state);
        }
    });
    
    // Create SVG visualizer
    const visualizer = new SimpleGraphVisualizer(viewportRef.current, ...);
    
    // Initialize with graph data
    physicsSimulator.setGraphData(graphData);  // ← Trigger!
}, []);
```

---

## Step 3: Physics Initialization
📍 [PhysicsSimulator.ts](src/physics/PhysicsSimulator.ts#L44-L52)

```typescript
public setGraphData(graphData: GraphData): void {
    this.graphData = graphData;  // Store graph structure
    this.rectifySpatialModule();  // Generate positions!
}

private rectifySpatialModule(): void {
    for (const node of this.graphData.nodes) {
        if (!hasModuleNode(this.spatialModule, node.id)) {
            // Generate random initial position
            const sigma = 1;  // spawnSigma parameter
            const position = [
                sigma * unitGaussianRandom(),  // Random x
                sigma * unitGaussianRandom()   // Random y
            ];
            setModuleNode(this.spatialModule, node.id, { position });
        }
    }
}
```

**Data structure now:**
```typescript
spatialModule: DictGraphModule<SpatialNode> = {
    "center": { position: [0.12, -0.43] },   // Random!
    "node1":  { position: [1.05, 0.88] },
    "node2":  { position: [-0.67, 0.21] },
    "node3":  { position: [0.34, -1.12] },
    "node4":  { position: [-0.89, -0.15] }
}
```

**Key separation:**
- `GraphData`: Structure (nodes, edges) - from Neo4j
- `spatialModule`: Layout (positions) - computed by physics

---

## Step 4: Animation Loop Starts
📍 [PhysicsSimulator.ts](src/physics/PhysicsSimulator.ts#L103-L113)

```typescript
constructor() {
    this.startAnimationLoop();  // Starts immediately!
}

private startAnimationLoop(): void {
    const loop = () => {
        this.updateSimulation();  // Calculate forces & update positions
        this.animationFrameId = requestAnimationFrame(loop);  // ~60 FPS
    };
    this.animationFrameId = requestAnimationFrame(loop);
}
```

**Every frame (16ms):**

---

## Step 5: Force Calculations (Each Frame)
📍 [PhysicsSimulator.ts](src/physics/PhysicsSimulator.ts#L115-L170)

```typescript
private applyForces(): void {
    const params = this.simulationParameters;
    const forces = {};
    
    // 1. REPULSION (all pairs, n²)
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const pos1 = getModuleNode(spatialModule, node1.id).position;
            const pos2 = getModuleNode(spatialModule, node2.id).position;
            const distance = magnitude(pos1 - pos2);
            
            // Repel: force = repulsionStrength / distance²
            const force = params.repulsionStrength / (distance * distance);
            forces[node1.id] += force * direction;
            forces[node2.id] -= force * direction;
        }
    }
    
    // 2. TENSION (only connected edges)
    for (const edge of edges) {
        const distance = magnitude(sourcePos - targetPos);
        
        // Attract: force = tensionStrength × distance
        const force = params.tensionStrength * distance;
        forces[source] += force * direction * edge.weight;
        forces[target] -= force * direction * edge.weight;
    }
    
    // 3. UPDATE POSITIONS directly (with friction)
    mutateModuleAllNodes(spatialModule, (id, spatial) => {
        const displacement = force * params.stepSize;
        const damped = displacement * params.friction;
        spatial.position += damped;  // Direct position update!
    });
}
```

### Example Calculation for "center" Node:

```
Forces from:
- node1: repels 0.5/1.2² = 0.35 ←
- node2: repels 0.5/0.8² = 0.78 →
- node3: repels 0.5/1.5² = 0.22 ↓
- node4: repels 0.5/0.9² = 0.62 ↑

Edge tensions:
- to node1: pulls 0.1×1.2 = 0.12 →
- to node2: pulls 0.1×0.8 = 0.08 ←
- to node3: pulls 0.1×1.5 = 0.15 ↑
- to node4: pulls 0.1×0.9 = 0.09 ↓

Net force: [0.45, -0.15]
Displacement: [0.45, -0.15] × 0.5 (stepSize) = [0.225, -0.075]
Damped: [0.225, -0.075] × 0.85 (friction) = [0.19, -0.064]

New position: [0.12, -0.43] + [0.19, -0.064] = [0.31, -0.494]
```

### Physics Parameters:
```typescript
{
    repulsionStrength: 0.5,   // Nodes push apart
    tensionStrength: 0.1,     // Edges pull together
    friction: 0.85,           // Damping (0-1)
    stepSize: 0.5,            // How much to move per frame
    spawnSigma: 1             // Random spawn radius
}
```

---

## Step 6: State Callback Fires
📍 [PhysicsSimulator.ts](src/physics/PhysicsSimulator.ts#L115-L121)

```typescript
private updateSimulation(): void {
    this.applyForces();  // Positions updated!
    
    if (this.stateChangeCallback) {
        this.stateChangeCallback(this.getState());  // ← Fire callback!
    }
}

public getState(): PhysicsState {
    return { spatialModule: this.spatialModule };  // Send positions
}
```

**Every 16ms, this callback executes** ↓

---

## Step 7: Visualizer Updates
📍 [SimpleGraphViewer.tsx](src/view/SimpleGraphViewer.tsx#L56-L59) → [SimpleGraphVisualizer.ts](src/view/SimpleGraphVisualizer.ts#L174-L178)

```typescript
// Callback from physics:
const physicsSimulator = new PhysicsSimulator((state) => {
    visualizerRef.current.updateState(graphData, state);  // ← Called!
});

// In visualizer:
public updateState(graphData: GraphData, physicsState: PhysicsState): void {
    this.graphData = graphData;  // Store graph structure
    this.spatialModule = physicsState.spatialModule;  // Store positions
    this.render();  // ← Redraw SVG!
}
```

---

## Step 8: SVG Rendering
📍 [SimpleGraphVisualizer.ts](src/view/SimpleGraphVisualizer.ts#L180-L198)

```typescript
private render(): void {
    this.svg.innerHTML = '';  // Clear old SVG
    
    // Render edges first (so they're behind nodes)
    for (const edge of this.graphData.edges) {
        this.renderEdge(edge.source, edge.target, edge.weight);
    }
    
    // Render nodes on top
    for (const node of this.graphData.nodes) {
        this.renderNode(node.id);
    }
}

private renderNode(nodeId: string): void {
    const spatial = getModuleNode(this.spatialModule, nodeId);
    const [x, y] = this.mapToSVGCoords(
        spatial.position[0],  // Physics world coords
        spatial.position[1]
    );
    
    // Create SVG circle
    const circle = document.createElementNS('svg', 'circle');
    circle.setAttribute('cx', x.toString());
    circle.setAttribute('cy', y.toString());
    circle.setAttribute('r', '12');  // nodeRadius
    circle.setAttribute('fill', 'rgb(100, 150, 255)');
    
    // Create label
    const text = document.createElementNS('svg', 'text');
    text.setAttribute('x', x.toString());
    text.setAttribute('y', (y - 22).toString());  // Above node
    text.textContent = nodeId;
    
    this.svg.appendChild(circle);
    this.svg.appendChild(text);
}
```

### Coordinate Mapping:
```typescript
// Physics world: -1 to +1
// SVG viewport: 0 to window.innerWidth/Height

const svgX = (worldX - viewBox.minX) / viewBox.width * svgWidth;
const svgY = (worldY - viewBox.minY) / viewBox.height * svgHeight;
```

---

## Final Visual Output

```
Browser renders SVG:

         node3
           ○
           |
  node1    |    node2
    ○ ---- ○ ---- ○
         center
           |
           ○
         node4
```

The nodes start at random positions, then the forces push/pull them into this star formation over ~1 second!

---

## Summary Flow Diagram

```
DUMMY_STAR_GRAPH (hardcoded)
    ↓
SimpleGraphViewer useState
    ↓
PhysicsSimulator.setGraphData()
    ↓
rectifySpatialModule() → Random positions generated
    ↓
Animation loop starts (60 FPS)
    ↓ (every 16ms)
applyForces() → Calculate repulsion + tension
    ↓
Update positions directly (with friction)
    ↓
Callback: stateChangeCallback(state)
    ↓
SimpleGraphVisualizer.updateState()
    ↓
render() → Clear SVG + draw edges + draw nodes
    ↓
Browser paints SVG circles & text
    ↓
User sees animated graph settling into place!
    ↓ (repeat 60x/sec)
```

---

## Key Concepts

### 1. Separation of Concerns
- **GraphData**: Structure (nodes, edges) - immutable, from Neo4j
- **spatialModule**: Layout (positions) - mutable, computed by physics

### 2. DictGraphModule Pattern
```typescript
type DictGraphModule<T> = { [nodeId: string]: T }

spatialModule: DictGraphModule<SpatialNode> = {
  "center": { position: [0, 0] },
  "node1": { position: [1.5, 2.3] }
}
```

Allows storing auxiliary data about nodes without modifying graph structure.

### 3. Direct Position Updates
No velocity/acceleration - forces directly modify positions each frame:
```typescript
position += (force × stepSize) × friction
```

This is simpler and settles faster than traditional velocity-based integration.

### 4. Continuous Rendering
Physics runs at 60 FPS constantly, triggering re-renders on every position change. This creates smooth animation as the graph settles into equilibrium.

---

## User Interactions

### Mouse Drag on Node
1. `handleNodeMouseDown()` → Set `draggingNodeId`
2. `handleMouseMove()` → Update position, call `onNodeDrag` callback
3. Callback adds node to `nodesToSkipSimulation` set
4. Physics loop skips that node (keeps other nodes simulating)
5. `handleMouseUp()` → Call `onNodeDrop`, remove from skip set
6. Node resumes physics simulation

### Pan/Zoom
- Mouse wheel → Adjust `viewBox` → Re-render with new coordinate mapping
- Mouse drag (background) → Pan by translating `viewBox`
- Touch pinch → Zoom gesture

### Setting New Graph Data
```javascript
window.setGraphData({
  nodes: [{id: "a"}, {id: "b"}],
  edges: [{source: "a", target: "b", weight: 1}]
})
```
Triggers entire flow from Step 3 onwards.

---

## Performance Characteristics

- **O(n²)** force calculations for n nodes (all-pairs repulsion)
- **O(e)** tension calculations for e edges
- **60 FPS** continuous rendering
- For 5 nodes: ~10 force calculations per frame = trivial
- For 100 nodes: ~5000 force calculations per frame = still fast
- For 1000+ nodes: Consider spatial indexing (KD-tree) for repulsion

Current implementation prioritizes simplicity over scalability.
