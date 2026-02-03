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
    colorToCSSWithBrightness,
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
    private defs: SVGDefsElement;
    private nodeElements: Map<string, NodeElements> = new Map();
    private edgeElements: Map<string, EdgeElements> = new Map();

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
        this.svg.style.userSelect = "none";
        this.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        this.svg.appendChild(this.defs);
    }

    /** Get or create a glow filter for the given radius and intensity. */
    private getGlowFilter(radius: number, intensity: number): string {
        const filterId = `glow-${radius}-${Math.round(intensity * 100)}`;
        if (!document.getElementById(filterId)) {
            const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
            filter.setAttribute("id", filterId);
            filter.setAttribute("x", "-100%");
            filter.setAttribute("y", "-100%");
            filter.setAttribute("width", "300%");
            filter.setAttribute("height", "300%");

            // Blur the source graphic
            const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
            blur.setAttribute("in", "SourceGraphic");
            blur.setAttribute("stdDeviation", radius.toString());
            blur.setAttribute("result", "blur");

            // Adjust opacity of blurred version
            const colorMatrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
            colorMatrix.setAttribute("in", "blur");
            colorMatrix.setAttribute("type", "matrix");
            colorMatrix.setAttribute("values", `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${intensity} 0`);
            colorMatrix.setAttribute("result", "glowAlpha");

            // Blend blurred glow with original using screen mode
            const blend = document.createElementNS("http://www.w3.org/2000/svg", "feBlend");
            blend.setAttribute("in", "glowAlpha");
            blend.setAttribute("in2", "SourceGraphic");
            blend.setAttribute("mode", "screen");
            blend.setAttribute("result", "glow");

            // Composite original on top
            const composite = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
            composite.setAttribute("in", "SourceGraphic");
            composite.setAttribute("in2", "glow");
            composite.setAttribute("operator", "over");

            filter.appendChild(blur);
            filter.appendChild(colorMatrix);
            filter.appendChild(blend);
            filter.appendChild(composite);
            this.defs.appendChild(filter);
        }
        return filterId;
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
        const brightness = node.brightnessMultiplier;

        // Update text
        text.setAttribute("x", x.toString());
        text.setAttribute("y", y.toString());
        text.setAttribute("fill", colorToCSSWithBrightness(getTextColor(node.color) === "white" ? [1, 1, 1] : [0, 0, 0], brightness));
        text.textContent = node.text;

        // Measure and update rect
        // Note: getBBox() on empty text returns x=0,y=0, so we calculate position manually
        const bbox = text.getBBox();
        const rectWidth = Math.max(bbox.width, FONT_SIZE) + 2 * PADDING;
        const rectHeight = Math.max(bbox.height, FONT_SIZE) + 2 * PADDING;
        rect.setAttribute("x", (x - rectWidth / 2).toString());
        rect.setAttribute("y", (y - rectHeight / 2).toString());
        rect.setAttribute("width", rectWidth.toString());
        rect.setAttribute("height", rectHeight.toString());
        rect.setAttribute("rx", (rectHeight / 2).toString());
        rect.setAttribute("fill", colorToCSSWithBrightness(node.color, brightness));
        rect.setAttribute("stroke", colorToCSS(node.borderColor));
        rect.setAttribute("stroke-width", node.outlineWidth.toString());

        // Apply glow filter if intensity > 0
        if (node.glowIntensity > 0 && node.glowRadius > 0) {
            const filterId = this.getGlowFilter(node.glowRadius, node.glowIntensity);
            group.setAttribute("filter", `url(#${filterId})`);
        } else {
            group.removeAttribute("filter");
        }

        group.setAttribute("opacity", node.opacity.toString());
    }

    private createNodeElements(id: string): NodeElements {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.dataset.nodeId = id;
        group.style.pointerEvents = "all";

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
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
