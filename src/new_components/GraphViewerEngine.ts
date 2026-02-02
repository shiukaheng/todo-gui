import { TaskListOut } from "todo-client";
import { DataSource } from "./DataSource";
import { GraphViewerEngineState } from "./GraphViewerEngineState";
import { ExtendNestedGraphData, NestedGraphData, nestGraphData } from "../new_utils/nestGraphData";
import { styleGraphData } from "./styleGraphData";

/**
 * Callback type for pushing state updates back to React.
 */
export type EngineStateCallback = (state: GraphViewerEngineState) => void;

type MinimalGraph = {
    nodes: string[]; // Array of node IDs
    edges: [string, string][]; // Array of [sourceId, targetId]
};

type GraphSpatialState = {
    positions: Record<string, { x: number; y: number }>; // Node ID to position mapping
};

interface SimulationModule {
    calculate(data: MinimalGraph): GraphSpatialState;
    saveState(): GraphSpatialState;
    loadState(state: GraphSpatialState): void;
}

class DummySimulationModule implements SimulationModule {
    calculate(data: MinimalGraph): GraphSpatialState {
        const positions: Record<string, { x: number; y: number }> = {};
        data.nodes.forEach((nodeId, index) => {
            positions[nodeId] = { x: Math.cos(index) * 100, y: Math.sin(index) * 100 };
        });
        return { positions };
    }
    saveState(): GraphSpatialState {
        return { positions: {} };
    }
    loadState(state: GraphSpatialState): void {
        // No-op for dummy
    }
}

export type PositionedGraphData<G extends NestedGraphData> = ExtendNestedGraphData<
    // Node extra properties
    {
        x: number;
        y: number;
    },
    // Edge extra properties
    {}, G
>;

/**
 * GraphViewerEngine - Imperative class that owns the animation loop.
 *
 * PURPOSE:
 * This is where all the "escape from React" work happens. The engine:
 * - Owns the requestAnimationFrame loop
 * - Reads data from the DataSource each frame
 * - Runs physics simulation
 * - Renders to the DOM (canvas, SVG, or direct DOM manipulation)
 * - Pushes state back to React when something UI-relevant changes
 *
 * LIFECYCLE:
 * ```
 * constructor()  → Called once when React component mounts
 *     │              Set up: create canvas, attach event listeners, start loop
 *     ▼
 * [animation loop runs continuously]
 *     │
 *     ▼
 * destroy()      → Called once when React component unmounts
 *                   Tear down: cancel animation frame, remove listeners, clean up
 * ```
 *
 * WHAT TO IMPLEMENT IN THE ANIMATION LOOP:
 *
 * 1. READ DATA (already done)
 *    ```ts
 *    const { data, isNew } = this.dataSource.read();
 *    ```
 *
 * 2. REBUILD GRAPH STRUCTURE (when isNew is true)
 *    ```ts
 *    if (isNew) {
 *        this.nodes = data.tasks.map(task => ({
 *            id: task.id,
 *            x: Math.random() * width,  // or use previous positions
 *            y: Math.random() * height,
 *            vx: 0, vy: 0,  // velocities for physics
 *            ...task
 *        }));
 *        this.edges = buildEdgesFromTasks(data.tasks);
 *    }
 *    ```
 *
 * 3. PHYSICS STEP (every frame, or until settled)
 *    ```ts
 *    for (const node of this.nodes) {
 *        // Apply forces: repulsion, attraction, gravity, damping
 *        node.vx += forceX;
 *        node.vy += forceY;
 *        node.x += node.vx;
 *        node.y += node.vy;
 *    }
 *    ```
 *
 * 4. RENDER (every frame)
 *    ```ts
 *    ctx.clearRect(0, 0, width, height);
 *    for (const edge of this.edges) { drawEdge(edge); }
 *    for (const node of this.nodes) { drawNode(node); }
 *    ```
 *
 * 5. EMIT STATE (throttled, only when meaningful changes occur)
 *    ```ts
 *    if (this.selectedNodeId !== prevSelectedNodeId) {
 *        this.emitState();
 *    }
 *    ```
 *
 * EVENT HANDLING:
 * Attach event listeners in constructor, remove in destroy:
 * ```ts
 * constructor() {
 *     this.handleClick = this.handleClick.bind(this);
 *     this.container.addEventListener('click', this.handleClick);
 * }
 *
 * destroy() {
 *     this.container.removeEventListener('click', this.handleClick);
 * }
 * ```
 */
export class GraphViewerEngine {
    private animationFrameId: number | null = null;
    private frameCount = 0;
    private isSimulating = true;
    private svg: SVGSVGElement;
    private simulationModule: SimulationModule | null = null;

    // TODO: Add your internal state here
    // private nodes: GraphNode[] = [];
    // private edges: GraphEdge[] = [];

    constructor(
        private container: HTMLDivElement,
        private dataSource: DataSource<TaskListOut>,
        private onStateChange: EngineStateCallback
    ) {
        console.log("[GraphViewerEngine] Created, starting animation loop");

        // Create SVG element
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
        this.container.appendChild(this.svg);

        // For now, we default to starting with a DummySimulationModule
        const dummyModule = new DummySimulationModule();
        this.setSimulationModule(dummyModule);

        this.startLoop();
    }

    setSimulationModule(module: SimulationModule) {
        // If there's an existing module, save its state
        let oldState: GraphSpatialState | null = null
        if (this.simulationModule !== null) {
            oldState = this.simulationModule.saveState();
        }
        this.simulationModule = module;
        module.loadState(oldState ?? { positions: {} });
    }

    /**
     * Push current state to React.
     * Call this when something UI-relevant changes (selection, hover, etc.)
     * Throttle appropriately to avoid excessive re-renders.
     */
    private emitState() {
        this.onStateChange({
            isSimulating: this.isSimulating,
            // TODO: Add more state as you implement features
            // selectedNodeId: this.selectedNodeId,
            // hoveredNodeId: this.hoveredNodeId,
        });
    }

    private addSpatialData<G extends NestedGraphData>(graphData: G): PositionedGraphData<G> {
        // Adds x,y positions to each node based on simulation results
        // If there is no simulationModule, return default positions of (0,0)
        // Otherwise, get positions from simulationModule
        throw new Error("Method not implemented.");
    }

    /**
     * The main animation loop.
     * This is where physics, rendering, and state updates happen.
     */
    private startLoop() {
        const tick = () => {
            this.frameCount++;

            // ─────────────────────────────────────────────────────────────
            // STEP 1: Read data from React
            // ─────────────────────────────────────────────────────────────
            const { data, isNew, version } = this.dataSource.read();

            const nestedData = nestGraphData(data); // Pre-process to a format thats friendly to add metadata
            const styledNestedData = styleGraphData(nestedData); // Infer visual style from node data
            const positionedData = this.addSpatialData(styledNestedData); // Add x,y positions from simulation
            // TODO: Navigation module (not settable externally)

            this.animationFrameId = requestAnimationFrame(tick);
        };

        this.animationFrameId = requestAnimationFrame(tick);
    }

    /**
     * Clean up all resources.
     * Called when the React component unmounts.
     */
    destroy() {
        this.isSimulating = false;
        this.emitState();

        console.log(`[GraphViewerEngine] Destroyed after ${this.frameCount} frames`);

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // TODO: Remove event listeners
        // this.container.removeEventListener('mousemove', this.handleMouseMove);

        // Remove SVG from DOM
        this.svg.remove();
    }
}
