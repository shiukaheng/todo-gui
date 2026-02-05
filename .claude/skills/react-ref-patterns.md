# React Ref Patterns Skill

Use this skill when creating React hooks that return handles/methods from objects stored in refs, or when debugging HMR (Hot Module Replacement) issues with stale references.

## The Stale Ref Anti-Pattern

When a hook creates an object in `useEffect` and stores it in a ref, returning methods directly from that ref at render time causes stale references:

```typescript
// ❌ BAD - Anti-pattern that breaks on HMR and initial render
function useEngine(): EngineHandles {
    const engineRef = useRef<Engine | null>(null);

    useEffect(() => {
        engineRef.current = new Engine();
        return () => engineRef.current?.destroy();
    }, []);

    // Problem: This runs BEFORE useEffect, so engineRef.current is null
    // After HMR, component re-renders but useEffect cleanup/setup timing
    // can cause handles to point to destroyed or wrong engine
    return {
        doThing: engineRef.current?.doThing ?? noop,  // Captures null!
        handle: engineRef.current?.getHandle() ?? NOOP_HANDLE,
    };
}
```

### Why This Fails

1. **First render**: `engineRef.current` is `null` (useEffect hasn't run yet)
2. **Return value captures NOOP handles** (snapshot at render time)
3. **useEffect runs**, creates engine, but no re-render triggers
4. **Component continues using stale NOOP handles**
5. **On HMR**: Same problem - timing of cleanup/setup vs render causes stale refs

## The Delegating Handles Pattern

Create stable handle objects that look up the ref at **call time**, not render time:

```typescript
// ✅ GOOD - Delegating handles that work with HMR
function useEngine(): EngineHandles {
    const engineRef = useRef<Engine | null>(null);

    // Create stable handles that delegate to current engine
    const handles = useMemo<EngineHandles>(() => ({
        doThing: () => engineRef.current?.doThing(),
        getValue: () => engineRef.current?.getValue() ?? defaultValue,
        get state() {
            return engineRef.current?.getState() ?? DEFAULT_STATE;
        },
    }), []); // Empty deps = stable reference

    useEffect(() => {
        engineRef.current = new Engine();
        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
        };
    }, []);

    return handles; // Same object reference every render
}
```

### Why This Works

1. **useMemo with `[]`**: Creates handle object once, stable reference
2. **Arrow functions**: Capture `engineRef` (the ref itself), not `engineRef.current`
3. **Call-time lookup**: `engineRef.current?.doThing()` looks up engine when called
4. **Before init**: Safely no-ops via optional chaining
5. **After HMR**: Calls go to new engine instance (ref was updated)

## Checklist

When writing hooks that expose handles from ref-stored objects:

- [ ] Use `useMemo(() => ({ ... }), [])` for stable handle object
- [ ] Each method delegates via `ref.current?.method()`
- [ ] Use getters for properties: `get state() { return ref.current?.state }`
- [ ] Handle null case with `??` for return values
- [ ] Never capture `ref.current` directly in the return statement

## Real Example from Codebase

See `src/graph/useGraphViewerEngine.ts`:

```typescript
export function useGraphViewerEngine(
    viewportContainerRef: React.RefObject<HTMLDivElement>
): GraphViewerHandles {
    const engineRef = useRef<AbstractGraphViewerEngine | null>(null);

    // Stable delegating handles
    const handles = useMemo<GraphViewerHandles>(() => ({
        navigation: {
            up: () => engineRef.current?.getNavigationHandle().up(),
            down: () => engineRef.current?.getNavigationHandle().down(),
            // ... more methods
            get state() {
                return engineRef.current?.getNavigationHandle().state
                    ?? { type: 'idle' as const };
            },
        },
        fly: {
            up: (pressed: boolean) =>
                engineRef.current?.getFlyNavigationHandle()?.up(pressed),
            // ... more methods
        },
    }), []);

    useEffect(() => {
        engineRef.current = new GraphViewerEngine(/* ... */);
        return () => {
            engineRef.current?.destroy();
            engineRef.current = null;
        };
    }, []);

    return handles;
}
```

## When This Pattern Applies

Use delegating handles when:
- Hook creates objects in useEffect and exposes their methods
- Hook returns handles that will be used in event handlers
- Component needs to survive HMR without losing functionality
- Methods need to work before useEffect runs (graceful degradation)

Don't overcomplicate when:
- Returning primitive values from useState (already reactive)
- Returning callbacks created with useCallback (stable by design)
- The ref is only used internally, never exposed
