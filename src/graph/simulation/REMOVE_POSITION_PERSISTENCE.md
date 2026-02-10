# Removing Position Persistence (Temporary Feature)

## Why This Exists

This is a **temporary client-side solution** to persist node positions between browser sessions. It stores positions in `localStorage` and restores them on page load.

**This should be removed** once proper backend position storage is implemented.

## How to Remove (2 steps)

### Step 1: Delete the persistence file

```bash
rm src/graph/simulation/PositionPersistenceManager.ts
rm src/graph/simulation/REMOVE_POSITION_PERSISTENCE.md  # This file
```

### Step 2: Remove integration from GraphViewerEngine.ts

Search for `TEMPORARY` comments and delete the marked lines:

```typescript
// DELETE THIS IMPORT:
import { PositionPersistenceManager } from "./simulation/PositionPersistenceManager";

// DELETE THIS FIELD:
private positionPersistence: PositionPersistenceManager;

// DELETE THIS BLOCK (3 lines):
this.positionPersistence = new PositionPersistenceManager();
const savedPositions = this.positionPersistence.loadPositions();
if (Object.keys(savedPositions).length > 0) {
    this.simulationState = { positions: savedPositions };
}

// DELETE THIS LINE:
this.positionPersistence.start(() => this.simulationState);

// DELETE THIS LINE:
this.positionPersistence.stop();
```

### Step 3: Remove export from simulation/index.ts

```typescript
// DELETE THIS EXPORT:
export * from "./PositionPersistenceManager";
```

## That's It!

The feature is completely removed with no orphaned code.

## Testing After Removal

1. Clear localStorage: `localStorage.removeItem('graph-positions')`
2. Reload page - positions should now be computed fresh each time
3. Backend position storage should handle persistence instead
