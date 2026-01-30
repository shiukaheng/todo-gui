import { GraphData, GraphNode, GraphEdge } from "@/types/GraphData";
import { SpatialNode } from "@/common/app_types/nodeTypes";
import { DictGraphModule } from "@/common/dict_graph/DictGraphModule";
import { getModuleNode, hasModuleNode } from "@/common/dict_graph/api/functional_dict_graph_module_api";
import { PhysicsState } from "@/physics/PhysicsSimulator";
import { ViewTransform } from "./GraphNavigator";
import { INavigator } from "./INavigator";

export { ViewTransform };

export interface UIConfig {
    nodeRadius: number;
    nodeStrokeWidth: number;
    edgeStrokeWidth: number;
    fontSize: number;
}

interface SVGSize {
    width: number;
    height: number;
}

interface Position {
    x: number;
    y: number;
}

export type NodeDragCallback = (nodeId: string, newPosition: Position) => void;
export type NodeDropCallback = (nodeId: string) => void;
export type NodeClickCallback = (nodeId: string) => void;

// Navigation event callbacks
export type MouseDownCallback = (event: MouseEvent) => void;
export type MouseMoveCallback = (event: MouseEvent) => void;
export type MouseUpCallback = (event: MouseEvent) => void;
export type WheelCallback = (event: WheelEvent, svgX: number, svgY: number) => void;
export type TouchStartCallback = (event: TouchEvent) => void;
export type TouchMoveCallback = (event: TouchEvent, svgRect: DOMRect) => void;
export type TouchEndCallback = (event: TouchEvent) => void;

export type Color = [number, number, number];

function idToName(nodeId: string): string {
    const parts = nodeId.split(":");
    if (parts.length >= 2) {
        return parts.slice(1).join(":");
    } else {
        return nodeId;
    }
}

/**
 * Calculate relative luminance and return appropriate text color
 */
function getTextColor(bgColor: [number, number, number]): string {
    // Calculate relative luminance using WCAG formula
    const [r, g, b] = bgColor.map(c => {
        const val = c / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    // Use white text for dark backgrounds, black for light backgrounds
    return luminance > 0.5 ? 'black' : 'white';
}

export interface GraphVisualizerCallbacks {
    onNodeDrag?: NodeDragCallback;
    onNodeDrop?: NodeDropCallback;
    onNodeClick?: NodeClickCallback;
    onMouseDown?: MouseDownCallback;
    onMouseMove?: MouseMoveCallback;
    onMouseUp?: MouseUpCallback;
    onWheel?: WheelCallback;
    onTouchStart?: TouchStartCallback;
    onTouchMove?: TouchMoveCallback;
    onTouchEnd?: TouchEndCallback;
}

export class GraphVisualizer {
    private containerElement: HTMLElement;
    public transform: ViewTransform;
    private uiConfig: UIConfig;
    private svgSize: SVGSize;
    
    private graphData: GraphData = { nodes: [], edges: [] };
    private spatialModule: DictGraphModule<SpatialNode> = {};
    
    private svg: SVGSVGElement;
    private draggingNodeId: string | null;
    private draggingNodeOffset: Position | null;
    
    private callbacks: GraphVisualizerCallbacks;
    private currentNavigator: INavigator | null = null;
    
    private mouseDownPosition: Position | null = null;
    private clickThreshold: number = 5;
    private potentialClickNodeId: string | null = null;

    constructor(
        containerElement: HTMLElement,
        initialTransform: ViewTransform,
        callbacks: GraphVisualizerCallbacks = {}
    ) {
        this.containerElement = containerElement;
        this.transform = { ...initialTransform };
        this.callbacks = callbacks;
        this.uiConfig = {
            nodeRadius: 12,
            nodeStrokeWidth: 2,
            edgeStrokeWidth: 2,
            fontSize: 20,
        };
        this.svgSize = { width: 0, height: 0 };
        this.draggingNodeId = null;
        this.draggingNodeOffset = null;

        this.svg = this.initializeSVG();
        this.attachEventListeners();
        this.updateSvgSize();

        window.addEventListener('resize', this.updateSvgSize.bind(this));
    }

    private initializeSVG(): SVGSVGElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        
        this.containerElement.style.margin = '0';
        this.containerElement.style.padding = '0';
        this.containerElement.style.width = '100vw';
        this.containerElement.style.height = '100vh';
        this.containerElement.style.overflow = 'hidden';
        this.containerElement.style.boxSizing = 'border-box';
        
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.border = '0px';
        svg.style.touchAction = 'none';
        svg.style.userSelect = 'none';
        svg.style.webkitUserSelect = 'none';
        svg.style.boxSizing = 'border-box';
        
        this.containerElement.appendChild(svg);
        return svg;
    }

    private attachEventListeners(): void {
        this.svg.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.svg.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.svg.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.svg.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        this.svg.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.svg.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.svg.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.svg.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
    }

    private updateSvgSize(): void {
        this.svgSize = {
            width: this.containerElement.clientWidth,
            height: this.containerElement.clientHeight,
        };
        this.render();
    }

    public updateState(graphData: GraphData, physicsState: PhysicsState): void {
        this.graphData = graphData;
        this.spatialModule = physicsState.spatialModule;
        this.render();
    }

    /**
     * Set the navigator that controls view transformations
     * Automatically wires up event handlers and manages lifecycle
     */
    public setNavigator(navigator: INavigator | null): void {
        // Deactivate current navigator
        if (this.currentNavigator) {
            this.currentNavigator.deactivate();
            this.currentNavigator.setTransformChangeCallback(null);
            // Clear navigation event handlers
            this.callbacks.onMouseDown = undefined;
            this.callbacks.onMouseMove = undefined;
            this.callbacks.onMouseUp = undefined;
            this.callbacks.onWheel = undefined;
            this.callbacks.onTouchStart = undefined;
            this.callbacks.onTouchMove = undefined;
            this.callbacks.onTouchEnd = undefined;
        }

        this.currentNavigator = navigator;

        // Activate new navigator
        if (navigator) {
            // Set the transform change callback
            navigator.setTransformChangeCallback((transform) => {
                this.transform = transform;
                this.render();
            });
            
            // Wire up event handlers
            const handlers = navigator.getEventHandlers();
            this.callbacks = {
                ...this.callbacks, // Keep node interaction callbacks
                ...handlers
            };
            
            // Set initial transform
            this.transform = navigator.getTransform();
            
            // Notify size
            navigator.updateSize(this.svgSize.width, this.svgSize.height);
            
            // Activate
            navigator.activate();
            
            // Trigger re-render with new transform
            this.render();
        }
    }

    /**
     * Get the current navigator
     */
    public getNavigator(): INavigator | null {
        return this.currentNavigator;
    }

    private render(): void {
        this.svg.innerHTML = '';

        // Render edges
        for (const edge of this.graphData.edges) {
            if (!hasModuleNode(this.spatialModule, edge.source) ||
                !hasModuleNode(this.spatialModule, edge.target)) {
                continue;
            }
            this.renderEdge(edge);
        }

        // Render nodes
        for (const node of this.graphData.nodes) {
            if (!hasModuleNode(this.spatialModule, node.id)) continue;
            this.renderNode(node);
        }
    }

    private renderNode(node: GraphNode): void {
        const spatial = getModuleNode(this.spatialModule, node.id);
        const [x, y] = this.mapToSVGCoords(spatial.position[0], spatial.position[1]);
        const margin = 8;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('data-node-id', node.id);
        
        // Apply opacity to the entire group
        const opacity = node.opacity ?? 1.0;
        g.setAttribute('opacity', opacity.toString());

        // Determine colors
        const nodeColor = node.color || [1, 1, 1]; // Default to white if no color
        // Convert from [0,1] to [0,255] for rendering
        const r255 = Math.round(nodeColor[0] * 255);
        const g255 = Math.round(nodeColor[1] * 255);
        const b255 = Math.round(nodeColor[2] * 255);
        const bgColor = `rgb(${r255}, ${g255}, ${b255})`;
        const textColor = getTextColor([r255, g255, b255]);

        // Create text first to measure it
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x.toString());
        text.setAttribute('y', y.toString());
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', this.uiConfig.fontSize.toString());
        text.setAttribute('fill', textColor);
        // Use node.data.id if it exists, otherwise fall back to node.id
        const displayId = node.data.id ?? node.id;
        text.textContent = idToName(displayId);
        
        // Temporarily append to measure
        this.svg.appendChild(text);
        const bbox = text.getBBox();
        this.svg.removeChild(text);

        // Draw rectangle with margins
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', (bbox.x - margin).toString());
        rect.setAttribute('y', (bbox.y - margin).toString());
        rect.setAttribute('width', (bbox.width + 2 * margin).toString());
        rect.setAttribute('height', (bbox.height + 2 * margin).toString());
        rect.setAttribute('fill', bgColor);
        
        // Use borderColor if present (for cursor styling), otherwise default to black
        const borderColor = node.borderColor || 'black';
        rect.setAttribute('stroke', borderColor);
        rect.setAttribute('stroke-width', this.uiConfig.nodeStrokeWidth.toString());
        
        // Apply dotted style if specified
        if (node.dotted) {
            rect.setAttribute('stroke-dasharray', '5,3');
        }

        g.appendChild(rect);
        g.appendChild(text);
        this.svg.appendChild(g);

        g.addEventListener('mousedown', this.handleNodeMouseDown.bind(this, node.id));
    }

    private renderEdge(edge: GraphEdge): void {
        const sourcePos = getModuleNode(this.spatialModule, edge.source).position;
        const targetPos = getModuleNode(this.spatialModule, edge.target).position;
        
        let [x1, y1] = this.mapToSVGCoords(sourcePos[0], sourcePos[1]);
        let [x2, y2] = this.mapToSVGCoords(targetPos[0], targetPos[1]);

        // Adjust to start/end at node edges
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const radius = this.uiConfig.nodeRadius;
        x1 += radius * Math.cos(angle);
        y1 += radius * Math.sin(angle);
        x2 -= radius * Math.cos(angle);
        y2 -= radius * Math.sin(angle);

        // Get weight from edge data, default to 1
        const weight = edge.data.weight ?? 1;
        
        // Get edge styling properties
        const opacity = edge.opacity ?? 1.0;
        const edgeColor = edge.color;
        let strokeColor = '#999'; // Default gray
        
        if (edgeColor) {
            // Convert from [0,1] to [0,255] for rendering
            const r = Math.round(edgeColor[0] * 255);
            const g = Math.round(edgeColor[1] * 255);
            const b = Math.round(edgeColor[2] * 255);
            strokeColor = `rgb(${r}, ${g}, ${b})`;
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1.toString());
        line.setAttribute('y1', y1.toString());
        line.setAttribute('x2', x2.toString());
        line.setAttribute('y2', y2.toString());
        line.setAttribute('stroke', strokeColor);
        line.setAttribute('stroke-width', (this.uiConfig.edgeStrokeWidth * weight).toString());
        line.setAttribute('opacity', opacity.toString());
        
        // Apply dotted style if specified
        if (edge.dotted) {
            line.setAttribute('stroke-dasharray', '5,3');
        }

        this.svg.appendChild(line);
    }

    /**
     * Transform world coordinates to screen (SVG) coordinates using the view matrix
     */
    private mapToSVGCoords(worldX: number, worldY: number): [number, number] {
        const svgX = this.transform.a * worldX + this.transform.c * worldY + this.transform.tx;
        const svgY = this.transform.b * worldX + this.transform.d * worldY + this.transform.ty;
        return [svgX, svgY];
    }

    /**
     * Transform screen (SVG) coordinates to world coordinates using inverse of view matrix
     */
    private mapFromSVGCoords(svgX: number, svgY: number): [number, number] {
        // Calculate determinant for inverse matrix
        const det = this.transform.a * this.transform.d - this.transform.b * this.transform.c;
        if (Math.abs(det) < 1e-10) {
            // Matrix is singular, return origin
            return [0, 0];
        }
        
        // Apply inverse transformation
        const dx = svgX - this.transform.tx;
        const dy = svgY - this.transform.ty;
        
        const worldX = (this.transform.d * dx - this.transform.c * dy) / det;
        const worldY = (-this.transform.b * dx + this.transform.a * dy) / det;
        
        return [worldX, worldY];
    }

    private handleWheel(event: WheelEvent): void {
        event.preventDefault();
        const rect = this.svg.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (this.callbacks.onWheel) {
            this.callbacks.onWheel(event, x, y);
        }
    }

    private handleMouseDown(event: MouseEvent): void {
        if (this.callbacks.onMouseDown) {
            this.callbacks.onMouseDown(event);
        }
    }

    private handleMouseMove(event: MouseEvent): void {
        if (this.draggingNodeId && this.draggingNodeOffset) {
            const rect = this.svg.getBoundingClientRect();
            const svgX = event.clientX - rect.left - this.draggingNodeOffset.x;
            const svgY = event.clientY - rect.top - this.draggingNodeOffset.y;
            const [worldX, worldY] = this.mapFromSVGCoords(svgX, svgY);
            
            if (this.callbacks.onNodeDrag) {
                this.callbacks.onNodeDrag(this.draggingNodeId, { x: worldX, y: worldY });
            }
            return;
        }

        if (this.callbacks.onMouseMove) {
            this.callbacks.onMouseMove(event);
        }
    }

    private handleMouseUp(event: MouseEvent): void {
        // Check if this was a click (minimal movement)
        if (this.mouseDownPosition && this.potentialClickNodeId) {
            const dx = event.clientX - this.mouseDownPosition.x;
            const dy = event.clientY - this.mouseDownPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.clickThreshold && this.callbacks.onNodeClick) {
                this.callbacks.onNodeClick(this.potentialClickNodeId);
            }
        }
        
        if (this.draggingNodeId) {
            if (this.callbacks.onNodeDrop) {
                this.callbacks.onNodeDrop(this.draggingNodeId);
            }
            this.draggingNodeId = null;
            this.draggingNodeOffset = null;
        }
        
        this.mouseDownPosition = null;
        this.potentialClickNodeId = null;
        
        if (this.callbacks.onMouseUp) {
            this.callbacks.onMouseUp(event);
        }
    }

    private handleNodeMouseDown(nodeId: string, event: MouseEvent): void {
        event.stopPropagation();
        
        this.mouseDownPosition = { x: event.clientX, y: event.clientY };
        this.potentialClickNodeId = nodeId;
        this.draggingNodeId = nodeId;
        
        const rect = this.svg.getBoundingClientRect();
        const spatial = getModuleNode(this.spatialModule, nodeId);
        const [svgX, svgY] = this.mapToSVGCoords(spatial.position[0], spatial.position[1]);
        
        this.draggingNodeOffset = {
            x: event.clientX - rect.left - svgX,
            y: event.clientY - rect.top - svgY
        };
    }

    private handleTouchStart(event: TouchEvent): void {
        if (this.callbacks.onTouchStart) {
            this.callbacks.onTouchStart(event);
        }
    }

    private handleTouchMove(event: TouchEvent): void {
        event.preventDefault();
        
        if (this.callbacks.onTouchMove) {
            const rect = this.svg.getBoundingClientRect();
            this.callbacks.onTouchMove(event, rect);
        }
    }

    private handleTouchEnd(event: TouchEvent): void {
        if (this.callbacks.onTouchEnd) {
            this.callbacks.onTouchEnd(event);
        }
    }

    public destroy(): void {
        window.removeEventListener('resize', this.updateSvgSize.bind(this));
        this.svg.remove();
    }
}
