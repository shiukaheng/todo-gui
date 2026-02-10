# Removing Edge Crossing Detector (Modular Feature)

## What This Does

Detects edge crossings in saved layouts to determine if they should be preserved or re-computed. If saved positions have few edge crossings (good layout), WebCola skips the unconstrained settling phase and preserves them. If many crossings (poor layout), it does a full two-phase re-layout.

## When to Remove

- If you want WebCola to always do two-phase initialization (unconstrained → constrained)
- If edge crossing detection is too expensive for your use case
- If you prefer simpler logic (always re-layout on first load)

## How to Remove (2 steps)

### Step 1: Delete the detector file

```bash
rm src/graph/simulation/edgeCrossingDetector.ts
rm src/graph/simulation/REMOVE_EDGE_CROSSING_DETECTOR.md  # This file
```

### Step 2: Remove integration from webColaEngine.ts

Search for `MODULAR` comments and delete marked sections:

**Delete import:**
```typescript
// DELETE THIS LINE:
import { hasGoodLayout } from "../edgeCrossingDetector";
```

**Replace the if block (around line 288):**

**BEFORE (with edge crossing detection):**
```typescript
if (isFirstInit) {
    // MODULAR: Check if saved positions are high quality (few edge crossings)
    // DELETE these 5 lines to always use two-phase init:
    const edges = Object.values(graph.dependencies).map(dep => ({
        fromId: dep.data.fromId,
        toId: dep.data.toId
    }));
    const hasGoodSavedLayout = hasGoodLayout(prevState.positions, edges);

    if (hasGoodSavedLayout) {
        // Saved positions are good quality - skip unconstrained phase
        console.log("[WebCola] Preserved saved positions (good layout detected)");
        this.constraintsApplied = true;
        this.lastMutationTime = null;
        this.rebuildLayout(true);
    } else {
        // Saved positions are poor quality or missing - do two-phase init
        console.log("[WebCola] Starting two-phase init (edge crossings detected or no saved positions)");
        this.lastMutationTime = performance.now();
        this.constraintsApplied = false;
        this.rebuildLayout(false);
    }
}
```

**AFTER (always two-phase init):**
```typescript
if (isFirstInit) {
    // First initialization: start without constraints, apply after delay
    this.lastMutationTime = performance.now();
    this.constraintsApplied = false;
    this.rebuildLayout(false);
}
```

## Configuration (Before Removal)

If you want to adjust thresholds instead of removing:

**Option 1: Make it more strict (preserve fewer layouts)**
```typescript
const hasGoodSavedLayout = hasGoodLayout(prevState.positions, edges, {
    threshold: 0.02  // Only preserve if < 2% edge crossings (stricter)
});
```

**Option 2: Make it more lenient (preserve more layouts)**
```typescript
const hasGoodSavedLayout = hasGoodLayout(prevState.positions, edges, {
    threshold: 0.10  // Preserve even with 10% edge crossings (looser)
});
```

**Option 3: Adjust sampling for large graphs**
```typescript
const hasGoodSavedLayout = hasGoodLayout(prevState.positions, edges, {
    samplingThreshold: 200,  // Use sampling only for >200 edges
    sampleSize: 500          // Check 500 samples instead of 200
});
```

## Testing After Removal

1. Clear localStorage: `localStorage.removeItem('graph-positions')`
2. Load a graph and let it settle
3. Reload page
4. Positions should now always do two-phase init (positions will shift during first second)
