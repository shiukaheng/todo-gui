/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH VIEWER ENGINE - Data Flow Documentation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This engine bridges React's declarative world with an imperative animation
 * loop. The engine reads/writes cursor state directly from the Zustand store.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         ZUSTAND STORE                                   │
 * │                                                                         │
 * │   useTodoStore: { graphData, cursor, api, setCursor, subscribe }       │
 * │                                                                         │
 * └──────────────────────────┬──────────────────────────────────────────────┘
 *                            │
 *              Engine reads/writes via useTodoStore.getState()
 *                            │
 *                            ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         ANIMATION LOOP                                  │
 * │                                                                         │
 * │   tick() runs every frame via requestAnimationFrame:                   │
 * │                                                                         │
 * │   1. SIMULATE  - Compute node positions (world space)                  │
 * │   2. STYLE     - Apply cursor styling (reads cursor from store)        │
 * │   3. NAVIGATE  - Compute view transform (pan/zoom)                     │
 * │   4. RENDER    - Draw to SVG                                           │
 * │                                                                         │
 * │   Also handles: user input (drag, pan, zoom), initial fit              │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SUMMARY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * INPUTS:
 *   - taskList       via setGraph()                  → Graph data from API
 *   - cursor         via useTodoStore.getState()    → Current cursor node
 *
 * OUTPUTS:
 *   - cursor changes via useTodoStore.getState().setCursor()
 *   - navInfoText    via useTodoStore.getState().setNavInfoText()
 *
 * INTERNAL:
 *   - simulationState  (node positions, physics)
 *   - navigationState  (pan/zoom transform)
 *   - user input handling (drag, scroll, touch)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USER INPUT FLOW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * User interactions (mouse, touch, wheel) are handled internally by the engine
 * and do NOT flow through React. This keeps interactions responsive (no React
 * re-render latency).
 *
 * ┌─────────────────┐
 * │   DOM Events    │  (mousedown, mousemove, wheel, touchstart, etc.)
 * │   on <svg>      │
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │  InputHandler   │  Normalizes events into UIEvents:
 * │                 │  - drag-start, drag-move, drag-end
 * │                 │  - click, tap, long-press
 * │                 │  - zoom (wheel)
 * │                 │  - touch-transform (pinch/rotate)
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  InteractionController                                                  │
 * │                                                                         │
 * │  Interprets UIEvents and manipulates engine systems:                   │
 * │                                                                         │
 * │  ┌─────────────────────┐     ┌─────────────────────────────────────┐   │
 * │  │  NODE DRAGGING      │     │  CANVAS NAVIGATION                  │   │
 * │  │                     │     │                                     │   │
 * │  │  drag-start on node │     │  drag-start on canvas               │   │
 * │  │        │            │     │        │                            │   │
 * │  │        ▼            │     │        ▼                            │   │
 * │  │  SimulationEngine   │     │  NavigationEngine (Manual)          │   │
 * │  │  .pinNodes()        │     │  .pan() / .zoom() / .rotate()       │   │
 * │  │        │            │     │        │                            │   │
 * │  │        ▼            │     │        ▼                            │   │
 * │  │  Node follows       │     │  View transform updates             │   │
 * │  │  cursor in world    │     │  (affects all nodes on screen)      │   │
 * │  │  space              │     │                                     │   │
 * │  └─────────────────────┘     └─────────────────────────────────────┘   │
 * │                                                                         │
 * │  ┌─────────────────────┐     ┌─────────────────────────────────────┐   │
 * │  │  WHEEL ZOOM         │     │  TOUCH GESTURES                     │   │
 * │  │                     │     │                                     │   │
 * │  │  wheel event        │     │  pinch → zoom                       │   │
 * │  │        │            │     │  two-finger drag → pan              │   │
 * │  │        ▼            │     │  two-finger rotate → rotate         │   │
 * │  │  NavigationEngine   │     │        │                            │   │
 * │  │  around cursor      │     │        ▼                            │   │
 * │  │  .zoom()            │     │  NavigationEngine methods           │   │
 * │  └─────────────────────┘     └─────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * KEY POINT: Dragging a node pins it via SimulationEngine.pinNodes(), which
 * fixes the node's position while other nodes continue to simulate around it.
 * On drag-end, the node is unpinned and rejoins the simulation.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { TaskListOut } from "todo-client";
import { CursorNeighbors, computeCursorNeighbors, EMPTY_CURSOR_NEIGHBORS } from "./GraphViewerEngineState";
import { getNavInfoText, GraphNavigationHandle, DEFAULT_NAV_MAPPING } from "./graphNavigation/types";
import { useTodoStore } from "../stores/todoStore";
import { GraphNavigationController } from "./graphNavigation/GraphNavigationController";
import { navigationStyleGraphData } from "./preprocess/navigationStyleGraphData";
import { nestGraphData, NestedGraphData } from "./preprocess/nestGraphData";
import { baseStyleGraphData, conditionalStyleGraphData, cursorStyleGraphData, StyledGraphData } from "./preprocess/styleGraphData";
import { computeConnectedComponents, ComponentGraphData } from "./preprocess/connectedComponents";

/** Concrete type for processed graph data: nested → components → styled. */
type ProcessedGraphData = StyledGraphData<ComponentGraphData<NestedGraphData>>;
import {
    SimulationEngine,
    SimulationState,
    EMPTY_SIMULATION_STATE,
    mergePositions,
    WebColaEngine,
} from "./simulation";
import {
    NavigationEngine,
    NavigationState,
    INITIAL_NAVIGATION_STATE,
    ViewportInfo,
    createPanZoomTransform,
} from "./navigation";
import { ManualNavigationEngine } from "./navigation/engines";
import { SVGRenderer } from "./render/SVGRenderer";
import { PerformanceMonitor } from "./render/PerformanceMonitor";
import { InputHandler, InteractionController } from "./input";
import { PositionedGraphData } from "./simulation/utils";

/**
 * Compute a transform that fits all nodes in the viewport.
 * Returns null if there are no nodes.
 */
function computeFitTransform(
    positionedData: PositionedGraphData<any>,
    viewport: ViewportInfo,
    padding: number = 50
) {
    const positions = Object.values(positionedData.tasks)
        .map((t: any) => t.position)
        .filter((p): p is [number, number] => p !== undefined);

    if (positions.length === 0) return null;

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of positions) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    const boundsWidth = maxX - minX || 1;
    const boundsHeight = maxY - minY || 1;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Compute scale to fit bounds in viewport (with padding)
    const availableWidth = viewport.width - padding * 2;
    const availableHeight = viewport.height - padding * 2;
    const scale = Math.min(
        availableWidth / boundsWidth,
        availableHeight / boundsHeight,
        2 // Cap max zoom to avoid over-zooming on small graphs
    );

    // Compute translation to center the graph
    // screenCenter = worldCenter * scale + translate
    // translate = screenCenter - worldCenter * scale
    const panX = viewport.width / 2 - centerX * scale;
    const panY = viewport.height / 2 - centerY * scale;

    return createPanZoomTransform(scale, panX, panY);
}

const DEFAULT_SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/**
 * GraphViewerEngine - Imperative class that owns the animation loop.
 * See top-level comment for full data flow documentation.
 */
export class GraphViewerEngine {
    private animationFrameId: number | null = null;
    private frameCount = 0;
    private lastFrameTime = 0;
    private svg: SVGSVGElement;

    // Graph data: processed and ready for simulation (set via setGraph())
    private graphData: ProcessedGraphData | null = null;

    // Simulation: computes node positions in world space
    private simulationEngine: SimulationEngine;
    private simulationState: SimulationState = EMPTY_SIMULATION_STATE;

    // Navigation: computes world → screen transform
    private navigationEngine: NavigationEngine;
    private navigationState: NavigationState = INITIAL_NAVIGATION_STATE;

    // Rendering: draws to SVG with reconciliation
    private renderer: SVGRenderer;

    // Input handling
    private inputHandler: InputHandler;
    private interactionController: InteractionController;

    // Performance monitoring (optional)
    private performanceMonitor: PerformanceMonitor | null = null;

    // Track if we've done the initial fit-to-graph
    private initialFitDone = false;

    // Graph navigation (keyboard-driven cursor movement)
    private navigationController: GraphNavigationController;
    private currentCursorNeighbors: CursorNeighbors = EMPTY_CURSOR_NEIGHBORS;
    private selectors: string[] = DEFAULT_SELECTORS;

    constructor(private container: HTMLDivElement) {
        console.log("[GraphViewerEngine] Created, starting animation loop");

        // Create navigation controller for keyboard-driven cursor movement
        this.navigationController = new GraphNavigationController(
            DEFAULT_NAV_MAPPING,
            DEFAULT_SELECTORS,
            (nodeId: string) => useTodoStore.getState().setCursor(nodeId),
            () => this.emitState()
        );

        // Create SVG element
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
        this.container.appendChild(this.svg);

        // Create renderer (reconciliation-based for performance)
        this.renderer = new SVGRenderer(this.svg);

        // Default simulation: WebCola constraint-based layout
        this.simulationEngine = new WebColaEngine({
            flowDirection: "x",
            flowSeparation: 100,
            symmetricDiffLinkLengths: true,
            flowReversed: true,
            componentGrouping: true,
        });

        // Default navigation: manual pan/zoom/rotate
        this.navigationEngine = new ManualNavigationEngine();

        // Set up input handling
        this.inputHandler = new InputHandler(this.svg);
        this.interactionController = new InteractionController({
            getSimulationEngine: () => this.simulationEngine,
            setSimulationEngine: (engine) => this.setSimulationEngine(engine),
            getNavigationEngine: () => this.navigationEngine,
            setNavigationEngine: (engine) => this.setNavigationEngine(engine),
            getNavigationState: () => this.navigationState,
            getSimulationState: () => this.simulationState,
            onNodeClick: (nodeId: string) => useTodoStore.getState().setCursor(nodeId),
        });
        this.inputHandler.setCallback((event) => {
            this.interactionController.handleEvent(event);
        });

        this.lastFrameTime = performance.now();
        this.startLoop();

        // Enable performance monitor by default
        // this.setPerformanceMonitor(true);

        // Emit initial state to React
        this.emitState();
    }

    /**
     * Update the graph data. Performs nest → components → style transformations.
     * Call this when the raw graph data changes (e.g., from subscription).
     *
     * @param taskList - Raw graph data from the API
     */
    setGraph(taskList: TaskListOut): void {
        const nested = nestGraphData(taskList);
        const withComponents = computeConnectedComponents(nested);
        let styled = baseStyleGraphData(withComponents);
        styled = conditionalStyleGraphData(styled);
        this.graphData = styled;
    }

    /**
     * Get the navigation handle for keyboard-driven cursor movement.
     */
    getNavigationHandle(): GraphNavigationHandle {
        return this.navigationController.handle;
    }

    /**
     * Replace the simulation engine.
     * Current positions are preserved and passed to the new engine.
     * The old engine is destroyed if it has a destroy method.
     */
    setSimulationEngine(engine: SimulationEngine): void {
        this.simulationEngine.destroy?.();
        this.simulationEngine = engine;
    }

    /**
     * Replace the navigation engine.
     * Current view transform is preserved and passed to the new engine.
     * The old engine is destroyed if it has a destroy method.
     */
    setNavigationEngine(engine: NavigationEngine): void {
        this.navigationEngine.destroy?.();
        this.navigationEngine = engine;
    }

    /**
     * Enable or disable the performance monitor (stats.js).
     * @param enabled - Whether to show the monitor
     * @param panel - Which panel to display (0=FPS, 1=MS, 2=MB)
     */
    setPerformanceMonitor(enabled: boolean, panel: 0 | 1 | 2 = 0): void {
        if (enabled && !this.performanceMonitor) {
            this.performanceMonitor = new PerformanceMonitor(this.container, panel);
        } else if (!enabled && this.performanceMonitor) {
            this.performanceMonitor.destroy();
            this.performanceMonitor = null;
        } else if (enabled && this.performanceMonitor) {
            this.performanceMonitor.showPanel(panel);
        }
    }

    /**
     * Get current viewport dimensions.
     */
    private getViewport(): ViewportInfo {
        return {
            width: this.container.clientWidth || 800,
            height: this.container.clientHeight || 600,
        };
    }

    /**
     * Push current state to the store.
     */
    private emitState(): void {
        const navState = this.navigationController.state;

        // Compute candidate count for info text
        let candidateCount = 0;
        if (navState.type === 'confirmingTarget') {
            const { topological } = this.currentCursorNeighbors;
            candidateCount = navState.targetType === 'parents'
                ? topological.parents.length
                : topological.children.length;
        } else if (navState.type === 'selectingParentForPeers') {
            candidateCount = Object.keys(this.currentCursorNeighbors.topological.peers).length;
        }

        useTodoStore.getState().setNavInfoText(getNavInfoText(navState, candidateCount));
    }

    /**
     * Computes and emits cursor neighbors if changed.
     */
    private updateRelevantNeighbors(positionedData: PositionedGraphData<any>): void {
        const cursor = useTodoStore.getState().cursor;

        // Build positions map from positioned data
        const positions: { [key: string]: [number, number] } = {};
        for (const [taskId, task] of Object.entries(positionedData.tasks)) {
            const taskData = task as any;
            if (taskData.position) {
                positions[taskId] = taskData.position;
            }
        }

        // Compute new neighbors
        const newNeighbors = computeCursorNeighbors(
            cursor,
            positionedData.dependencies,
            positions
        );

        // Check if neighbors changed (simple JSON comparison for now)
        const oldJson = JSON.stringify(this.currentCursorNeighbors);
        const newJson = JSON.stringify(newNeighbors);

        if (oldJson !== newJson) {
            this.currentCursorNeighbors = newNeighbors;
            this.navigationController.setCursorNeighbors(newNeighbors);
            this.emitState();
        }
    }

    /**
     * The main animation loop.
     */
    private startLoop(): void {
        const tick = (currentTime: number) => {
            this.performanceMonitor?.begin();

            this.frameCount++;
            const deltaTime = currentTime - this.lastFrameTime;
            this.lastFrameTime = currentTime;

            // Skip if no graph data has been set yet
            if (!this.graphData) {
                this.performanceMonitor?.end();
                this.animationFrameId = requestAnimationFrame(tick);
                return;
            }

            const graphData = this.graphData;

            // ─────────────────────────────────────────────────────────────
            // STEP 1: Simulate - compute world-space positions
            //
            // The simulation engine computes WHERE nodes should be laid out
            // in an abstract "world space" coordinate system. Stateful but
            // with a functional interface. Positions are portable across
            // different engine implementations.
            // ─────────────────────────────────────────────────────────────
            this.simulationState = this.simulationEngine.step(
                { graph: graphData, deltaTime },
                this.simulationState
            );
            const positionedData = mergePositions(graphData, this.simulationState);
            this.updateRelevantNeighbors(positionedData);

            // ─────────────────────────────────────────────────────────────
            // STEP 1.5: Initial fit - center graph in viewport on first frame
            //
            // Compute bounding box of all nodes and set transform to fit
            // the graph in the viewport with some padding.
            // ─────────────────────────────────────────────────────────────
            if (!this.initialFitDone) {
                const viewport = this.getViewport();
                const fitTransform = computeFitTransform(positionedData, viewport);
                if (fitTransform) {
                    this.navigationState = { transform: fitTransform };
                    this.initialFitDone = true;
                }
            }

            // ─────────────────────────────────────────────────────────────
            // STEP 1.6: Apply cursor styling
            // ─────────────────────────────────────────────────────────────
            const cursor = useTodoStore.getState().cursor;
            let styledData = cursorStyleGraphData(positionedData, cursor);

            // ─────────────────────────────────────────────────────────────
            // STEP 1.7: Apply navigation styling (shortcut key overlays)
            // ─────────────────────────────────────────────────────────────
            styledData = navigationStyleGraphData(
                styledData,
                this.currentCursorNeighbors,
                this.navigationController.state,
                this.selectors,
                DEFAULT_NAV_MAPPING
            );

            // ─────────────────────────────────────────────────────────────
            // STEP 2: Navigate - compute world → screen transform
            //
            // The navigation engine determines HOW we view the world: pan, zoom,
            // and optionally animated transitions. Produces a ViewTransform
            // (2D affine matrix) that maps world coordinates to screen pixels.
            // ─────────────────────────────────────────────────────────────
            this.navigationState = this.navigationEngine.step(
                {
                    graph: styledData,
                    viewport: this.getViewport(),
                    deltaTime,
                },
                this.navigationState
            );

            // ─────────────────────────────────────────────────────────────
            // STEP 3: Render - draw to SVG
            //
            // Uses reconciliation to minimize DOM operations.
            // ─────────────────────────────────────────────────────────────
            this.renderer.render(styledData, this.navigationState.transform);

            this.performanceMonitor?.end();
            this.animationFrameId = requestAnimationFrame(tick);
        };

        this.animationFrameId = requestAnimationFrame(tick);
    }

    /**
     * Clean up all resources.
     * Called when the React component unmounts.
     */
    destroy(): void {
        console.log(`[GraphViewerEngine] Destroyed after ${this.frameCount} frames`);

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Clean up input handling
        this.inputHandler.destroy();
        this.interactionController.destroy();

        // Clean up compositional objects
        this.simulationEngine.destroy?.();
        this.navigationEngine.destroy?.();
        this.renderer.clear();
        this.performanceMonitor?.destroy();

        // Remove SVG from DOM
        this.svg.remove();
    }
}
