# GraphViewerEngine Architecture

## The Problem

We need to run a real-time physics simulation for graph visualization using `requestAnimationFrame`. React's declarative rendering model doesn't fit this use case:

- React re-renders are triggered by state changes, not animation frames
- Complex physics calculations in React components cause jank and re-render storms
- We need imperative control over a continuous animation loop

But we still need React for:
- Receiving data updates (`taskList` prop)
- Rendering UI that responds to engine state (selected node, viewport info, etc.)

**Challenge:** Bridge React's declarative world with an imperative animation loop without memory leaks, stale data, or infinite re-render loops.

---

## The Solution

### Bidirectional Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         REACT                                │
│                                                              │
│   taskList prop ──────► dataSource.set() ──► marks dirty    │
│                              (via useEffect)                 │
│                                                              │
│   engineState ◄──────── setEngineState() ◄── stableCallback │
│        │                                                     │
│        └──► drives UI                                        │
└─────────────────────────────────────────────────────────────┘
                          ▲           │
                          │           ▼
┌─────────────────────────────────────────────────────────────┐
│                   GraphViewerEngine                          │
│                                                              │
│   requestAnimationFrame loop:                                │
│     1. dataSource.read() → { data, isNew }                  │
│     2. physics/rendering logic                               │
│     3. onStateChange({ ... }) → pushes state to React       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. DataSource (React → Engine)

A simple class with dirty-flag tracking:

```typescript
class DataSource<T> {
    set(value: T)  // Called by React when props change, marks dirty
    read()         // Called by engine each frame, returns { data, isNew }, clears dirty
}
```

**Critical:** Only call `set()` inside a `useEffect` with proper dependencies. Otherwise, unrelated re-renders will mark data as "new" every frame.

```typescript
// WRONG - marks dirty on every re-render
dataSourceRef.current.set(taskList);

// CORRECT - only marks dirty when taskList actually changes
useEffect(() => {
    dataSourceRef.current?.set(taskList);
}, [taskList]);
```

#### 2. State Callback (Engine → React)

Engine calls a callback to push state updates back to React:

```typescript
type EngineStateCallback = (state: GraphViewerEngineState) => void;

class GraphViewerEngine {
    constructor(container, dataSource, onStateChange: EngineStateCallback) { ... }
}
```

**Critical:** Use a stable callback ref pattern to avoid recreating the engine when React's setState reference changes:

```typescript
const onStateChangeRef = useRef(setEngineState);
onStateChangeRef.current = setEngineState;

const stableCallback = useCallback((state) => {
    onStateChangeRef.current(state);
}, []);
```

#### 3. Lifecycle Management

Engine is created once when the DOM container mounts, destroyed on unmount:

```typescript
useEffect(() => {
    const container = viewportContainerRef.current;
    if (!container) return;

    engineRef.current = new GraphViewerEngine(container, dataSource, stableCallback);

    return () => {
        engineRef.current?.destroy();
        engineRef.current = null;
    };
}, []);
```

---

## Pitfalls Avoided

| Pitfall | How We Avoid It |
|---------|-----------------|
| Engine recreated on every render | Empty dependency array in creation useEffect |
| Stale callback reference | Stable callback via ref pattern |
| "New data" every frame | Only call `set()` in useEffect with proper deps |
| Memory leaks | `destroy()` cancels animation frame in cleanup |
| Ref dependencies don't trigger effects | Pass data directly, not refs |

---

## File Structure

```
new_components/
├── DataSource.ts              # Generic dirty-flag data bridge (React → Engine)
├── GraphViewerEngineState.ts  # Types for engine → React state
├── GraphViewerEngine.ts       # Imperative class with rAF loop ← IMPLEMENT HERE
├── useGraphViewerEngine.ts    # Hook managing lifecycle (don't modify)
├── NewGraphViewer.tsx         # React component shell
└── GraphViewerEngine.md       # This documentation
```

## Where to Implement What

| File | Modify? | What to do |
|------|---------|------------|
| `DataSource.ts` | No | Generic, reusable as-is |
| `GraphViewerEngineState.ts` | Yes | Add fields as you expose more state to React |
| `GraphViewerEngine.ts` | **Yes** | Implement physics, rendering, event handling |
| `useGraphViewerEngine.ts` | Rarely | Plumbing is done; extend only for new callbacks |
| `NewGraphViewer.tsx` | Yes | Add React UI that responds to engine state |
