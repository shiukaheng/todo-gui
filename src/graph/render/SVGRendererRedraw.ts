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
} from "./utils";

export { ViewTransform, RenderGraphData, RenderNode, RenderEdge };

// Simpler / naive implementation of the graph renderer that clears and redraws everything on each render call.

export class SVGRendererRedraw {
    private svg: SVGSVGElement;

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
    }

    render(data: RenderGraphData, transform: ViewTransform): void {
        this.svg.innerHTML = "";

        // Draw edges first (below nodes)
        for (const [id, edge] of Object.entries(data.dependencies)) {
            const from = data.tasks[edge.data.fromId];
            const to = data.tasks[edge.data.toId];
            if (from && to) {
                this.drawEdge(id, edge, from.position, to.position, transform);
            }
        }

        // Draw nodes
        for (const [id, node] of Object.entries(data.tasks)) {
            this.drawNode(id, node, transform);
        }
    }

    private drawNode(id: string, node: RenderNode, transform: ViewTransform): void {
        const [x, y] = worldToScreen(node.position, transform);

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("opacity", node.opacity.toString());
        g.dataset.nodeId = id;
        g.style.pointerEvents = "all";

        // Create text to measure
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x.toString());
        text.setAttribute("y", y.toString());
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("font-size", FONT_SIZE.toString());
        text.setAttribute("fill", getTextColor(node.color));
        text.textContent = node.text;
        text.style.pointerEvents = "none";

        // Measure text
        this.svg.appendChild(text);
        const bbox = text.getBBox();
        this.svg.removeChild(text);

        // Draw background rect
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", (bbox.x - PADDING).toString());
        rect.setAttribute("y", (bbox.y - PADDING).toString());
        rect.setAttribute("width", (bbox.width + 2 * PADDING).toString());
        rect.setAttribute("height", (bbox.height + 2 * PADDING).toString());
        rect.setAttribute("fill", colorToCSS(node.color));
        rect.setAttribute("stroke", colorToCSS(node.borderColor));
        rect.setAttribute("stroke-width", STROKE_WIDTH.toString());
        rect.style.pointerEvents = "all";

        g.appendChild(rect);
        g.appendChild(text);
        this.svg.appendChild(g);
    }

    private drawEdge(id: string, edge: RenderEdge, from: Vec2, to: Vec2, transform: ViewTransform): void {
        const [x1, y1] = worldToScreen(from, transform);
        const [x2, y2] = worldToScreen(to, transform);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toString());
        line.setAttribute("y1", y1.toString());
        line.setAttribute("x2", x2.toString());
        line.setAttribute("y2", y2.toString());
        line.setAttribute("stroke", colorToCSS(edge.color));
        line.setAttribute("stroke-width", STROKE_WIDTH.toString());
        line.setAttribute("opacity", edge.opacity.toString());
        line.dataset.edgeId = id;
        line.style.pointerEvents = "stroke";

        if (edge.dotted) {
            line.setAttribute("stroke-dasharray", "5,3");
        }

        this.svg.appendChild(line);
    }
}
