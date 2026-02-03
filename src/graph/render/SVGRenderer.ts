import {
    ViewTransform,
    RenderGraphData,
    RenderNode,
    RenderEdge,
    Vec2,
    FONT_SIZE,
    STROKE_WIDTH,
    colorToCSS,
    colorToCSSWithBrightness,
    worldToScreen,
} from "./utils";

export { ViewTransform, RenderGraphData, RenderNode, RenderEdge };

// Master scale coefficient - multiplies all size constants
const SCALE = 2.0;

// Node sizing
const NODE_SQUARE_SIZE = FONT_SIZE * 0.6 * SCALE;
const NODE_TEXT_GAP = 4 * SCALE;
const NODE_OUTLINE_WIDTH_SCALE = 0.5;

// Selector ring
const SELECTOR_RING_GAP = 2 * SCALE;
const SELECTOR_RING_STROKE_WIDTH = 2 * SCALE;
const SELECTOR_TEXT_OFFSET = 6 * SCALE;

// Shortcut key overlay
const SHORTCUT_KEY_MARGIN = 4 * SCALE;
const SHORTCUT_KEY_FONT_SIZE = 10 * SCALE;

// Off-screen indicator
const INDICATOR_MARGIN = 17.5 * SCALE;
const INDICATOR_SIZE = 6 * SCALE;

// Edge sizing
const EDGE_STROKE_WIDTH_SCALE = 0.5;
const EDGE_DASH_ARRAY = `${5 * SCALE},${3 * SCALE}`;

// Animation parameters
const BREATH_RATE = 1.25;  // Cycles per second
const BREATH_MIN_BRIGHTNESS = 0.1;
const BREATH_MAX_BRIGHTNESS = 1.0;

interface NodeElements {
    group: SVGGElement;
    selectorRing: SVGRectElement;
    rect: SVGRectElement;
    text: SVGTextElement;
    shortcutKeyText: SVGTextElement;
}

interface EdgeElements {
    line: SVGLineElement;
}

export class SVGRenderer {
    private svg: SVGSVGElement;
    private nodeElements: Map<string, NodeElements> = new Map();
    private edgeElements: Map<string, EdgeElements> = new Map();
    private offScreenIndicator: SVGPolygonElement | null = null;

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
        this.svg.style.userSelect = "none";
    }

    /** Get or create the off-screen indicator element */
    private getOffScreenIndicator(): SVGPolygonElement {
        if (!this.offScreenIndicator) {
            this.offScreenIndicator = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            this.offScreenIndicator.style.pointerEvents = "none";
            this.svg.appendChild(this.offScreenIndicator);
        }
        return this.offScreenIndicator;
    }

    render(data: RenderGraphData, transform: ViewTransform): void {
        const currentNodeIds = new Set(Object.keys(data.tasks));
        const currentEdgeIds = new Set(Object.keys(data.dependencies));

        // Remove stale edges
        for (const [id, elements] of this.edgeElements) {
            if (!currentEdgeIds.has(id)) {
                elements.line.remove();
                this.edgeElements.delete(id);
            }
        }

        // Remove stale nodes
        for (const [id, elements] of this.nodeElements) {
            if (!currentNodeIds.has(id)) {
                elements.group.remove();
                this.nodeElements.delete(id);
            }
        }

        // Update or create edges
        for (const [id, edge] of Object.entries(data.dependencies)) {
            const from = data.tasks[edge.data.fromId];
            const to = data.tasks[edge.data.toId];
            if (from && to) {
                this.reconcileEdge(id, edge, from.position, to.position, transform);
            }
        }

        // Update or create nodes
        for (const [id, node] of Object.entries(data.tasks)) {
            this.reconcileNode(id, node, transform);
        }

        // Off-screen indicator for cursor nodes
        this.updateOffScreenIndicator(data, transform);
    }

    /** Update off-screen indicator for nodes with selectorOutline that are outside viewport */
    private updateOffScreenIndicator(data: RenderGraphData, transform: ViewTransform): void {
        const viewport = {
            width: this.svg.clientWidth || 800,
            height: this.svg.clientHeight || 600,
        };
        const margin = INDICATOR_MARGIN;

        // Find first node with selectorOutline (cursor)
        let cursorNode: RenderNode | null = null;
        for (const node of Object.values(data.tasks)) {
            if (node.selectorOutline) {
                cursorNode = node;
                break;
            }
        }

        if (!cursorNode) {
            if (this.offScreenIndicator) {
                this.offScreenIndicator.style.display = "none";
            }
            return;
        }

        const [screenX, screenY] = worldToScreen(cursorNode.position, transform);

        // Check if on screen
        const isOnScreen =
            screenX >= 0 &&
            screenX <= viewport.width &&
            screenY >= 0 &&
            screenY <= viewport.height;

        if (isOnScreen) {
            if (this.offScreenIndicator) {
                this.offScreenIndicator.style.display = "none";
            }
            return;
        }

        // Determine which edges the cursor is beyond
        const offLeft = screenX < 0;
        const offRight = screenX > viewport.width;
        const offTop = screenY < 0;
        const offBottom = screenY > viewport.height;

        // Determine angle based on direction
        let angle: number;
        let indicatorX: number;
        let indicatorY: number;

        // Corner cases (dynamic rotation pointing directly at cursor)
        if (offLeft && offTop) {
            indicatorX = margin;
            indicatorY = margin;
            angle = Math.atan2(screenY - indicatorY, screenX - indicatorX);
        } else if (offRight && offTop) {
            indicatorX = viewport.width - margin;
            indicatorY = margin;
            angle = Math.atan2(screenY - indicatorY, screenX - indicatorX);
        } else if (offLeft && offBottom) {
            indicatorX = margin;
            indicatorY = viewport.height - margin;
            angle = Math.atan2(screenY - indicatorY, screenX - indicatorX);
        } else if (offRight && offBottom) {
            indicatorX = viewport.width - margin;
            indicatorY = viewport.height - margin;
            angle = Math.atan2(screenY - indicatorY, screenX - indicatorX);
        }
        // Edge cases (orthogonal)
        else if (offLeft) {
            angle = Math.PI;  // Point left (180°)
            indicatorX = margin;
            indicatorY = Math.max(margin, Math.min(viewport.height - margin, screenY));
        } else if (offRight) {
            angle = 0;  // Point right (0°)
            indicatorX = viewport.width - margin;
            indicatorY = Math.max(margin, Math.min(viewport.height - margin, screenY));
        } else if (offTop) {
            angle = Math.PI * 1.5;  // Point up (270°)
            indicatorX = Math.max(margin, Math.min(viewport.width - margin, screenX));
            indicatorY = margin;
        } else {
            angle = Math.PI * 0.5;  // Point down (90°)
            indicatorX = Math.max(margin, Math.min(viewport.width - margin, screenX));
            indicatorY = viewport.height - margin;
        }

        // Create equilateral triangle pointing in direction
        const indicator = this.getOffScreenIndicator();
        const size = INDICATOR_SIZE;

        // Equilateral triangle: vertices at 0°, 120°, 240° from center, rotated by angle
        const p1Angle = angle;
        const p2Angle = angle + Math.PI * 2 / 3;
        const p3Angle = angle + Math.PI * 4 / 3;

        const p1x = indicatorX + Math.cos(p1Angle) * size;
        const p1y = indicatorY + Math.sin(p1Angle) * size;
        const p2x = indicatorX + Math.cos(p2Angle) * size;
        const p2y = indicatorY + Math.sin(p2Angle) * size;
        const p3x = indicatorX + Math.cos(p3Angle) * size;
        const p3y = indicatorY + Math.sin(p3Angle) * size;

        indicator.setAttribute("points", `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);

        // Breathing animation (same as selector ring)
        const time = performance.now() / 1000;
        const breathBrightness = BREATH_MIN_BRIGHTNESS + (BREATH_MAX_BRIGHTNESS - BREATH_MIN_BRIGHTNESS) * (0.5 + 0.5 * Math.sin(time * BREATH_RATE * Math.PI * 2));

        indicator.setAttribute("fill", colorToCSSWithBrightness(cursorNode.selectorOutline!, breathBrightness));
        indicator.style.display = "";
    }

    private reconcileNode(id: string, node: RenderNode, transform: ViewTransform): void {
        const [x, y] = worldToScreen(node.position, transform);
        let elements = this.nodeElements.get(id);

        if (!elements) {
            elements = this.createNodeElements(id);
            this.nodeElements.set(id, elements);
            this.svg.appendChild(elements.group);
        }

        const { group, selectorRing, rect, text, shortcutKeyText } = elements;
        const brightness = node.brightnessMultiplier;

        // Minimal style: square node with text below
        const squareSize = NODE_SQUARE_SIZE;
        const textGap = NODE_TEXT_GAP;

        // Selector ring: outer breathing ring
        if (node.selectorOutline) {
            // Breathing animation: brightness oscillates with sine wave
            const time = performance.now() / 1000;
            const breathBrightness = BREATH_MIN_BRIGHTNESS + (BREATH_MAX_BRIGHTNESS - BREATH_MIN_BRIGHTNESS) * (0.5 + 0.5 * Math.sin(time * BREATH_RATE * Math.PI * 2));

            const ringSize = squareSize + SELECTOR_RING_GAP * 2 + SELECTOR_RING_STROKE_WIDTH;

            selectorRing.setAttribute("x", (x - ringSize / 2).toString());
            selectorRing.setAttribute("y", (y - ringSize / 2).toString());
            selectorRing.setAttribute("width", ringSize.toString());
            selectorRing.setAttribute("height", ringSize.toString());
            selectorRing.setAttribute("stroke", colorToCSSWithBrightness(node.selectorOutline, breathBrightness));
            selectorRing.setAttribute("stroke-width", SELECTOR_RING_STROKE_WIDTH.toString());
            selectorRing.style.display = "";
        } else {
            selectorRing.style.display = "none";
        }

        // Update rect as a square centered at position
        rect.setAttribute("x", (x - squareSize / 2).toString());
        rect.setAttribute("y", (y - squareSize / 2).toString());
        rect.setAttribute("width", squareSize.toString());
        rect.setAttribute("height", squareSize.toString());
        rect.setAttribute("fill", colorToCSSWithBrightness(node.color, brightness));
        rect.setAttribute("stroke", colorToCSS(node.borderColor));
        rect.setAttribute("stroke-width", (node.outlineWidth * NODE_OUTLINE_WIDTH_SCALE).toString());

        // Update text below the square (offset extra if selector ring is present)
        const selectorOffset = node.selectorOutline ? SELECTOR_TEXT_OFFSET : 0;
        text.setAttribute("x", x.toString());
        text.setAttribute("y", (y + squareSize / 2 + textGap + selectorOffset + FONT_SIZE / 2).toString());
        text.setAttribute("fill", colorToCSSWithBrightness(node.labelColor, brightness));
        text.textContent = node.text;

        // Shortcut key overlay: top-left of node square
        if (node.shortcutKeyOverlay) {
            shortcutKeyText.setAttribute("x", (x - squareSize / 2 - SHORTCUT_KEY_MARGIN).toString());
            shortcutKeyText.setAttribute("y", (y - squareSize / 2).toString());
            shortcutKeyText.setAttribute("fill", colorToCSSWithBrightness(node.labelColor, brightness));
            shortcutKeyText.textContent = node.shortcutKeyOverlay;
            shortcutKeyText.style.display = "";
        } else {
            shortcutKeyText.style.display = "none";
        }

        group.setAttribute("opacity", node.opacity.toString());
    }

    private createNodeElements(id: string): NodeElements {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.dataset.nodeId = id;
        group.style.pointerEvents = "all";

        // Selector ring: outer breathing ring (rendered behind the node)
        const selectorRing = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        selectorRing.style.pointerEvents = "none";
        selectorRing.setAttribute("fill", "none");
        selectorRing.style.display = "none";

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.style.pointerEvents = "all";

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("font-size", FONT_SIZE.toString());
        text.setAttribute("font-family", "monospace");
        text.style.pointerEvents = "none";

        // Shortcut key overlay: top-left of node
        const shortcutKeyText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        shortcutKeyText.setAttribute("text-anchor", "end");
        shortcutKeyText.setAttribute("dominant-baseline", "auto");
        shortcutKeyText.setAttribute("font-size", SHORTCUT_KEY_FONT_SIZE.toString());
        shortcutKeyText.setAttribute("font-family", "monospace");
        shortcutKeyText.style.pointerEvents = "none";
        shortcutKeyText.style.display = "none";

        group.appendChild(selectorRing);
        group.appendChild(rect);
        group.appendChild(text);
        group.appendChild(shortcutKeyText);

        return { group, selectorRing, rect, text, shortcutKeyText };
    }

    private reconcileEdge(id: string, edge: RenderEdge, from: Vec2, to: Vec2, transform: ViewTransform): void {
        const [x1, y1] = worldToScreen(from, transform);
        const [x2, y2] = worldToScreen(to, transform);
        let elements = this.edgeElements.get(id);

        if (!elements) {
            elements = this.createEdgeElements(id);
            this.edgeElements.set(id, elements);
            // Insert at beginning so edges are below nodes
            this.svg.insertBefore(elements.line, this.svg.firstChild);
        }

        const { line } = elements;

        line.setAttribute("x1", x1.toString());
        line.setAttribute("y1", y1.toString());
        line.setAttribute("x2", x2.toString());
        line.setAttribute("y2", y2.toString());
        line.setAttribute("stroke", colorToCSS(edge.color));
        line.setAttribute("opacity", edge.opacity.toString());
        line.setAttribute("stroke-dasharray", edge.dotted ? EDGE_DASH_ARRAY : "");
    }

    private createEdgeElements(id: string): EdgeElements {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("stroke-width", (STROKE_WIDTH * EDGE_STROKE_WIDTH_SCALE).toString());
        line.dataset.edgeId = id;
        line.style.pointerEvents = "stroke";
        return { line };
    }

    clear(): void {
        for (const elements of this.nodeElements.values()) {
            elements.group.remove();
        }
        for (const elements of this.edgeElements.values()) {
            elements.line.remove();
        }
        this.nodeElements.clear();
        this.edgeElements.clear();
        if (this.offScreenIndicator) {
            this.offScreenIndicator.remove();
            this.offScreenIndicator = null;
        }
    }
}
