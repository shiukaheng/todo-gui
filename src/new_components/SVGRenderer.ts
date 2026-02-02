import {
    ViewTransform,
    RenderGraphData,
    RenderNode,
    RenderEdge,
    Vec2,
    FONT_SIZE,
    STROKE_WIDTH,
    PADDING,
    colorToCSS,
    getTextColor,
    worldToScreen,
} from "./rendererUtils";

export { ViewTransform, RenderGraphData, RenderNode, RenderEdge };

interface NodeElements {
    group: SVGGElement;
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

        const { group, rect, text } = elements;

        // Update text
        text.setAttribute("x", x.toString());
        text.setAttribute("y", y.toString());
        text.setAttribute("fill", getTextColor(node.color));
        text.textContent = node.text;

        // Measure and update rect
        const bbox = text.getBBox();
        rect.setAttribute("x", (bbox.x - PADDING).toString());
        rect.setAttribute("y", (bbox.y - PADDING).toString());
        rect.setAttribute("width", (bbox.width + 2 * PADDING).toString());
        rect.setAttribute("height", (bbox.height + 2 * PADDING).toString());
        rect.setAttribute("fill", colorToCSS(node.color));
        rect.setAttribute("stroke", colorToCSS(node.borderColor));

        group.setAttribute("opacity", node.opacity.toString());
    }

    private createNodeElements(id: string): NodeElements {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.dataset.nodeId = id;
        group.style.pointerEvents = "all";

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("stroke-width", STROKE_WIDTH.toString());
        rect.style.pointerEvents = "all";

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("font-size", FONT_SIZE.toString());
        text.style.pointerEvents = "none";

        group.appendChild(rect);
        group.appendChild(text);

        return { group, rect, text };
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
        line.setAttribute("stroke-width", STROKE_WIDTH.toString());
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
