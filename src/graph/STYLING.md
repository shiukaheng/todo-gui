# Graph Styling Guide

How to add or modify styling features for graph nodes and edges.

## Data Flow

```
styleGraphData.ts → utils.ts → SVGRenderer.ts
   (compute)        (interface)    (render)
```

## Files to Modify

### 1. `src/graph/preprocess/styleGraphData.ts`

Defines style properties and computes them based on node/edge state.

**`StyledGraphData<G>` type** - node properties:
```typescript
{
    text: string;
    color: Color;              // node fill
    borderColor: Color;        // node stroke
    labelColor: Color;         // text below node
    outlineWidth: number;      // stroke width
    opacity: number;
    brightnessMultiplier: number;
    selectorOutline: Color | null;  // outer breathing ring, null = hidden
}
```

Edge properties:
```typescript
{
    text: string;
    color: Color;
    opacity: number;
    dotted: boolean;
}
```

**Functions:**
- `baseStyleGraphData()` - default values
- `conditionalStyleGraphData()` - state-based styling (completed/actionable/blocked)
- `cursorStyleGraphData()` - cursor highlight

### 2. `src/graph/render/utils.ts`

Render-ready interfaces consumed by SVGRenderer.

**`RenderNode`** - must mirror node properties from `StyledGraphData` plus `position: Vec2`

**`RenderEdge`** - must mirror edge properties from `StyledGraphData`

**Constants:**
```typescript
FONT_SIZE = 14
STROKE_WIDTH = 4
PADDING = 8
```

**Helpers:**
- `colorToCSS(color)` - `[r,g,b]` (0-1) → CSS rgb string
- `colorToCSSWithBrightness(color, multiplier)` - applies brightness in linear color space

### 3. `src/graph/render/SVGRenderer.ts`

Renders styled data to SVG.

**Methods:**
- `reconcileNode()` - update node SVG elements
- `reconcileEdge()` - update edge SVG elements
- `createNodeElements()` - create node SVG structure
- `createEdgeElements()` - create edge SVG structure

## Adding a Style Property

1. Add to `StyledGraphData` type in `styleGraphData.ts`
2. Set default in `baseStyleGraphData()`
3. Add to `RenderNode`/`RenderEdge` in `utils.ts`
4. Use in `SVGRenderer.ts` reconcile methods
5. (Optional) Apply conditionally in styling functions

## Current Node States

| State | brightnessMultiplier | labelColor | selectorOutline |
|-------|---------------------|------------|-----------------|
| Completed | 0.1 | green `[0,1,0]` | null |
| Actionable | 1.0 | white `[1,1,1]` | null |
| Blocked | 0.1 | white `[1,1,1]` | null |
| Cursor | 1.0 (min) | (unchanged) | white `[1,1,1]` |
