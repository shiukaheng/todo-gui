import {
    ViewTransform,
    RenderGraphData,
    RenderNode,
    RenderEdge,
    Vec2,
    Color,
    FONT_SIZE,
    STROKE_WIDTH,
    colorToCSS,
    colorToCSSWithBrightness,
    worldToScreen,
} from "./utils";

export type { ViewTransform, RenderGraphData, RenderNode, RenderEdge };

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
    shape: SVGPathElement;  // Can render square or D-shape
    text: SVGTextElement;
    shortcutKeyText: SVGTextElement;
}

interface EdgeElements {
    line: SVGLineElement;
}

interface PlanPathElements {
    group: SVGGElement;
    segments: Array<{ triangles: SVGPolygonElement[] }>;
    label: SVGTextElement;
}

export class SVGRenderer {
    private svg: SVGSVGElement;
    private nodeElements: Map<string, NodeElements> = new Map();
    private edgeElements: Map<string, EdgeElements> = new Map();
    private planPathElements: Map<string, PlanPathElements> = new Map();
    private offScreenIndicator: SVGPolygonElement | null = null;
    private styleElement: SVGStyleElement | null = null;

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
        this.svg.style.userSelect = "none";
        this.injectStyles();
    }

    private injectStyles(): void {
        // No CSS animations needed - we animate phase in render loop
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

    render(data: RenderGraphData, transform: ViewTransform, backgroundColor: Color = [0, 0, 0]): void {
        const currentNodeIds = new Set(Object.keys(data.tasks));
        const currentEdgeIds = new Set(Object.keys(data.dependencies));
        const currentPlanIds = new Set(Object.keys(data.plans));

        // Remove stale edges
        for (const [id, elements] of this.edgeElements) {
            if (!currentEdgeIds.has(id)) {
                elements.line.remove();
                this.edgeElements.delete(id);
            }
        }

        // Remove stale plan paths
        for (const [id, elements] of this.planPathElements) {
            if (!currentPlanIds.has(id)) {
                elements.group.remove();
                this.planPathElements.delete(id);
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

        // Update or create plan paths
        for (const [id, plan] of Object.entries(data.plans)) {
            this.reconcilePlanPath(id, plan, data.tasks, transform);
        }

        // Update or create nodes
        for (const [id, node] of Object.entries(data.tasks)) {
            this.reconcileNode(id, node, transform, backgroundColor);
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

    private reconcileNode(id: string, node: RenderNode, transform: ViewTransform, backgroundColor: Color): void {
        const [x, y] = worldToScreen(node.position, transform);
        let elements = this.nodeElements.get(id);

        if (!elements) {
            elements = this.createNodeElements(id);
            this.nodeElements.set(id, elements);
            this.svg.appendChild(elements.group);
        }

        const { group, selectorRing, shape, text, shortcutKeyText } = elements;
        const brightness = node.brightnessMultiplier;

        // Minimal style: square node with text below
        const size = NODE_SQUARE_SIZE;
        const halfSize = size / 2;
        const textGap = NODE_TEXT_GAP;

        // Selector ring: outer breathing ring
        if (node.selectorOutline) {
            // Breathing animation: brightness oscillates with sine wave
            const time = performance.now() / 1000;
            const breathBrightness = BREATH_MIN_BRIGHTNESS + (BREATH_MAX_BRIGHTNESS - BREATH_MIN_BRIGHTNESS) * (0.5 + 0.5 * Math.sin(time * BREATH_RATE * Math.PI * 2));

            const ringSize = size + SELECTOR_RING_GAP * 2 + SELECTOR_RING_STROKE_WIDTH;

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

        // Generate path based on shape
        let pathD: string;
        if (node.shape === 'upTriangle') {
            // Upright equilateral triangle (AND gate)
            const side = size;
            const h = side * Math.sqrt(3) / 2;
            const topY = y - h / 2;
            const bottomY = y + h / 2;
            const leftX = x - side / 2;
            const rightX = x + side / 2;
            pathD = `M ${x} ${topY} L ${rightX} ${bottomY} L ${leftX} ${bottomY} Z`;
        } else if (node.shape === 'downTriangle') {
            // Inverted equilateral triangle (OR gate)
            const side = size;
            const h = side * Math.sqrt(3) / 2;
            const topY = y - h / 2;
            const bottomY = y + h / 2;
            const leftX = x - side / 2;
            const rightX = x + side / 2;
            // Flip: bottom vertex at top, top vertices at bottom
            pathD = `M ${x} ${bottomY} L ${rightX} ${topY} L ${leftX} ${topY} Z`;
        } else if (node.shape === 'diamond') {
            // Diamond (ExactlyOne gate) - square rotated 45 degrees
            const top = y - halfSize;
            const bottom = y + halfSize;
            const left = x - halfSize;
            const right = x + halfSize;
            pathD = `M ${x} ${top} L ${right} ${y} L ${x} ${bottom} L ${left} ${y} Z`;
        } else if (node.shape === 'circle') {
            // Circle (NOT gate)
            const radius = halfSize;
            // Use SVG arc commands to draw a circle
            pathD = `M ${x - radius} ${y} A ${radius} ${radius} 0 1 0 ${x + radius} ${y} A ${radius} ${radius} 0 1 0 ${x - radius} ${y} Z`;
        } else {
            // Square (default for Task nodes)
            const left = x - halfSize;
            const right = x + halfSize;
            const top = y - halfSize;
            const bottom = y + halfSize;
            pathD = `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
        }

        shape.setAttribute("d", pathD);

        // Fill and stroke based on hollow state
        const strokeColor = colorToCSSWithBrightness(node.color, brightness);
        if (node.hollow) {
            // Hollow: fill with background color (to cover edges), stroke with node color
            shape.setAttribute("fill", colorToCSS(backgroundColor));
            shape.setAttribute("stroke", strokeColor);
            shape.setAttribute("stroke-width", (STROKE_WIDTH * 0.5).toString());
        } else {
            // Solid: fill with node color
            shape.setAttribute("fill", strokeColor);
            shape.setAttribute("stroke", "none");
            shape.setAttribute("stroke-width", "0");
        }

        // Update text below the shape (offset extra if selector ring is present)
        const selectorOffset = node.selectorOutline ? SELECTOR_TEXT_OFFSET : 0;
        text.setAttribute("x", x.toString());
        text.setAttribute("y", (y + halfSize + textGap + selectorOffset + FONT_SIZE / 2).toString());
        text.setAttribute("fill", colorToCSSWithBrightness(node.labelColor, brightness));
        text.textContent = node.text;

        // Shortcut key overlay: top-left of node (fixed white color, not affected by node styling)
        if (node.shortcutKeyOverlay) {
            shortcutKeyText.setAttribute("x", (x - halfSize - SHORTCUT_KEY_MARGIN).toString());
            shortcutKeyText.setAttribute("y", (y - halfSize).toString());
            shortcutKeyText.setAttribute("fill", "#ffffff");
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

        // Shape path: can render square or D-shape
        const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
        shape.style.pointerEvents = "all";

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
        group.appendChild(shape);
        group.appendChild(text);
        group.appendChild(shortcutKeyText);

        return { group, selectorRing, shape, text, shortcutKeyText };
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

    private reconcilePlanPath(
        planId: string,
        plan: RenderGraphData['plans'][string],
        tasks: RenderGraphData['tasks'],
        transform: ViewTransform
    ): void {
        // Get positions for all steps in the plan
        const positions: Vec2[] = [];
        for (const step of plan.steps) {
            const task = tasks[step.nodeId];
            if (task && task.position) {
                positions.push(task.position);
            }
        }

        // Need at least 2 positions to draw a path
        if (positions.length < 2) {
            // Remove if it exists
            const existing = this.planPathElements.get(planId);
            if (existing) {
                existing.group.remove();
                this.planPathElements.delete(planId);
            }
            return;
        }

        // Get or create plan path elements
        let elements = this.planPathElements.get(planId);
        const needsRecreate = !elements || elements.segments.length !== positions.length - 1;

        if (needsRecreate) {
            // Remove old elements
            if (elements) {
                elements.group.remove();
            }

            // Create new group
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.dataset.planId = planId;

            const segments: PlanPathElements['segments'] = [];

            // Create segments for each consecutive pair
            // We'll determine the number of triangles based on segment length during update
            for (let i = 0; i < positions.length - 1; i++) {
                segments.push({ triangles: [] });
            }

            // Create label for plan
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.style.pointerEvents = "none";
            label.style.fontSize = `${FONT_SIZE}px`;
            label.style.fontFamily = "monospace";
            label.style.userSelect = "none";
            group.appendChild(label);

            // Insert after edges but before nodes
            const firstNode = this.nodeElements.values().next().value;
            if (firstNode) {
                this.svg.insertBefore(group, firstNode.group);
            } else {
                this.svg.appendChild(group);
            }

            elements = { group, segments, label };
            this.planPathElements.set(planId, elements);
        }

        // Update positions and appearance
        const color = colorToCSS(plan.color);
        const opacity = plan.opacity.toString();

        // Triangle and gap sizes
        const triangleSize = 4 * SCALE;  // Side length of equilateral triangle
        const gapSize = triangleSize;    // Gap same length as triangle
        const patternSize = triangleSize + gapSize;

        let cumulativeScreenDistance = 0;

        for (let i = 0; i < elements.segments.length; i++) {
            const segment = elements.segments[i];
            const from = positions[i];
            const to = positions[i + 1];

            // Check if this step's node is completed
            const stepNodeId = plan.steps[i].nodeId;
            const stepTask = tasks[stepNodeId];
            const isStepCompleted = stepTask?.data?.calculatedValue === true;
            const completionOpacityMultiplier = isStepCompleted ? 0.1 : 1.0;

            const [x1, y1] = worldToScreen(from, transform);
            const [x2, y2] = worldToScreen(to, transform);

            // Calculate segment length and angle in screen space
            const dx = x2 - x1;
            const dy = y2 - y1;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // Calculate how many triangles fit
            const numTriangles = Math.floor(segmentLength / patternSize);

            // Adjust triangle count if needed
            while (segment.triangles.length < numTriangles) {
                const triangle = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                triangle.style.pointerEvents = "none";
                segment.triangles.push(triangle);
                elements.group.appendChild(triangle);
            }
            while (segment.triangles.length > numTriangles) {
                const triangle = segment.triangles.pop();
                if (triangle) triangle.remove();
            }

            // Position each triangle
            for (let j = 0; j < numTriangles; j++) {
                const triangle = segment.triangles[j];

                // Position at start of this pattern unit
                const distanceAlongSegment = j * patternSize + triangleSize / 2;
                const t = distanceAlongSegment / segmentLength;
                const centerX = x1 + dx * t;
                const centerY = y1 + dy * t;

                // Equilateral triangle pointing in direction of travel
                // Height from center to tip: h = (triangleSize * sqrt(3)) / 3
                // Height from center to base: h = (triangleSize * sqrt(3)) / 6
                const h1 = (triangleSize * Math.sqrt(3)) / 3;  // center to tip
                const h2 = (triangleSize * Math.sqrt(3)) / 6;  // center to base
                const halfBase = triangleSize / 2;

                // Tip (pointing forward)
                const tipX = centerX + h1 * Math.cos(angle);
                const tipY = centerY + h1 * Math.sin(angle);

                // Base left (perpendicular to direction)
                const baseLeftX = centerX - h2 * Math.cos(angle) + halfBase * Math.cos(angle + Math.PI / 2);
                const baseLeftY = centerY - h2 * Math.sin(angle) + halfBase * Math.sin(angle + Math.PI / 2);

                // Base right (perpendicular to direction)
                const baseRightX = centerX - h2 * Math.cos(angle) - halfBase * Math.cos(angle + Math.PI / 2);
                const baseRightY = centerY - h2 * Math.sin(angle) - halfBase * Math.sin(angle + Math.PI / 2);

                triangle.setAttribute("points", `${tipX},${tipY} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`);
                triangle.setAttribute("fill", color);

                // Calculate phase based on screen-space distance traveled + animated time offset
                const screenDistanceAlongSegment = segmentLength * t;
                const totalScreenDistanceToTriangle = cumulativeScreenDistance + screenDistanceAlongSegment;

                // Wave parameters
                const wavelength = 1000;  // Screen pixels per wave cycle
                const period = 3;         // Seconds per wave cycle
                const currentTime = performance.now() / 1000;

                // Phase as function of screen distance and time
                const phase = (totalScreenDistanceToTriangle / wavelength - currentTime / period) % 1.0;

                // Opacity from phase (cosine wave: 0.3 to 1.0)
                const waveOpacity = 0.3 + 0.7 * (Math.cos(phase * Math.PI * 2) * 0.5 + 0.5);
                triangle.setAttribute("opacity", (plan.opacity * waveOpacity * completionOpacityMultiplier).toString());
            }

            cumulativeScreenDistance += segmentLength;
        }

        // Update plan label along first segment
        if (positions.length >= 2) {
            const startPos = positions[0];
            const endPos = positions[1];
            const [x1, y1] = worldToScreen(startPos, transform);
            const [x2, y2] = worldToScreen(endPos, transform);

            // Calculate segment angle and perpendicular
            const dx = x2 - x1;
            const dy = y2 - y1;
            let angle = Math.atan2(dy, dx);
            let angleDeg = (angle * 180) / Math.PI;

            // Flip text if upside down (angle > 90° or < -90°)
            let flipped = false;
            if (angleDeg > 90 || angleDeg < -90) {
                angleDeg += 180;
                angle += Math.PI;
                flipped = true;
            }

            // Perpendicular direction (rotate 90 degrees)
            const perpAngle = angle + Math.PI / 2;
            const perpX = Math.cos(perpAngle);
            const perpY = Math.sin(perpAngle);

            // Choose upper side (negative Y in screen space)
            const offsetDistance = 15 * SCALE;
            const upperPerpX = perpY < 0 ? perpX : -perpX;
            const upperPerpY = perpY < 0 ? perpY : -perpY;

            // Always position at start of segment
            const labelX = x1 + upperPerpX * offsetDistance;
            const labelY = y1 + upperPerpY * offsetDistance;

            elements.label.setAttribute("x", labelX.toString());
            elements.label.setAttribute("y", labelY.toString());
            elements.label.setAttribute("fill", color);
            elements.label.setAttribute("opacity", plan.opacity.toString());
            elements.label.setAttribute("text-anchor", flipped ? "end" : "start");
            elements.label.setAttribute("dominant-baseline", "middle");

            // Rotate text to be parallel with segment
            elements.label.setAttribute("transform", `rotate(${angleDeg}, ${labelX}, ${labelY})`);

            // Set label text: "ID: text" or just "ID" if no text
            const labelText = plan.text ? `${plan.data.id}: ${plan.text}` : plan.data.id;
            elements.label.textContent = labelText;
        }
    }

    clear(): void {
        for (const elements of this.nodeElements.values()) {
            elements.group.remove();
        }
        for (const elements of this.edgeElements.values()) {
            elements.line.remove();
        }
        for (const elements of this.planPathElements.values()) {
            elements.group.remove();
        }
        this.nodeElements.clear();
        this.edgeElements.clear();
        this.planPathElements.clear();
        if (this.offScreenIndicator) {
            this.offScreenIndicator.remove();
            this.offScreenIndicator = null;
        }
    }
}
