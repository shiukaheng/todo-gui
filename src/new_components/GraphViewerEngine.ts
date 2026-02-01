import { TaskListOut } from "todo-client";
import { DataSource } from "./DataSource";
import { GraphViewerEngineState } from "./GraphViewerEngineState";

/**
 * Callback type for pushing state updates back to React.
 */
export type EngineStateCallback = (state: GraphViewerEngineState) => void;

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

        // TODO: Attach event listeners
        // this.handleMouseMove = this.handleMouseMove.bind(this);
        // this.container.addEventListener('mousemove', this.handleMouseMove);

        this.startLoop();
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

            if (isNew) {
                console.log(`[GraphViewerEngine] Frame ${this.frameCount}: NEW DATA (version ${version})`, {
                    taskCount: data.tasks?.length ?? 0,
                });

                // TODO: Rebuild graph structure from new data
                // this.rebuildGraph(data);
            }

            // ─────────────────────────────────────────────────────────────
            // STEP 2: Physics simulation step
            // ─────────────────────────────────────────────────────────────
            // TODO: Apply forces and update positions
            // this.simulatePhysicsStep();

            // ─────────────────────────────────────────────────────────────
            // STEP 3: Render
            // ─────────────────────────────────────────────────────────────
            // TODO: Clear and redraw
            // this.render();

            // ─────────────────────────────────────────────────────────────
            // STEP 4: Emit state to React (throttled)
            // ─────────────────────────────────────────────────────────────
            // Only emit when something changes, or periodically
            if (this.frameCount % 10 === 0 || isNew) {
                this.emitState();
            }

            // Log periodically for debugging
            if (this.frameCount % 60 === 0) {
                console.log(`[GraphViewerEngine] Frame ${this.frameCount}: ticking`);
            }

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
