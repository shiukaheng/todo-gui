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

interface NodeElements {
    group: SVGGElement;
    selectorRing: SVGRectElement;
    rect: SVGRectElement;
    text: SVGTextElement;
}

interface EdgeElements {
    line: SVGLineElement;
}

export class SVGRenderer {
    private svg: SVGSVGElement;
    private nodeElements: Map<string, NodeElements> = new Map();
    private edgeElements: Map<string, EdgeElements> = new Map();

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
        this.svg.style.userSelect = "none";
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
    }

    private reconcileNode(id: string, node: RenderNode, transform: ViewTransform): void {
        const [x, y] = worldToScreen(node.position, transform);
        let elements = this.nodeElements.get(id);

        if (!elements) {
            elements = this.createNodeElements(id);
            this.nodeElements.set(id, elements);
            this.svg.appendChild(elements.group);
        }

        const { group, selectorRing, rect, text } = elements;
        const brightness = node.brightnessMultiplier;

        // Minimal style: square node with text below (half size)
        const squareSize = FONT_SIZE * 0.6;
        const textGap = 4;

        // Selector ring: outer breathing ring
        if (node.selectorOutline) {
            // Breathing animation: brightness oscillates with sine wave
            const time = performance.now() / 1000;  // Convert to seconds
            const breathRate = 1.25;  // Cycles per second
            const minBrightness = 0.25;
            const maxBrightness = 1.0;
            const breathBrightness = minBrightness + (maxBrightness - minBrightness) * (0.5 + 0.5 * Math.sin(time * breathRate * Math.PI * 2));

            const ringGap = 4;  // Gap between node and ring
            const strokeWidth = 2;
            const ringSize = squareSize + ringGap * 2 + strokeWidth;

            selectorRing.setAttribute("x", (x - ringSize / 2).toString());
            selectorRing.setAttribute("y", (y - ringSize / 2).toString());
            selectorRing.setAttribute("width", ringSize.toString());
            selectorRing.setAttribute("height", ringSize.toString());
            selectorRing.setAttribute("stroke", colorToCSSWithBrightness(node.selectorOutline, breathBrightness));
            selectorRing.setAttribute("stroke-width", strokeWidth.toString());
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
        rect.setAttribute("stroke-width", (node.outlineWidth * 0.5).toString());

        // Update text below the square (offset extra if selector ring is present)
        const selectorOffset = node.selectorOutline ? 6 : 0;
        text.setAttribute("x", x.toString());
        text.setAttribute("y", (y + squareSize / 2 + textGap + selectorOffset + FONT_SIZE / 2).toString());
        text.setAttribute("fill", colorToCSSWithBrightness(node.labelColor, brightness));
        text.textContent = node.text;

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

        group.appendChild(selectorRing);
        group.appendChild(rect);
        group.appendChild(text);

        return { group, selectorRing, rect, text };
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
        line.setAttribute("stroke-dasharray", edge.dotted ? "5,3" : "");
    }

    private createEdgeElements(id: string): EdgeElements {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("stroke-width", (STROKE_WIDTH * 0.5).toString());
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
    }
}
