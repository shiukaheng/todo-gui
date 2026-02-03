/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH VIEWER ENGINE - Data Flow Documentation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This engine bridges React's declarative world with an imperative animation
 * loop. Data flows bidirectionally between React and the engine.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                              REACT                                      │
 * │                                                                         │
 * │   const [appState, setAppState] = useState({ cursor: null });          │
 * │   const engineState = useGraphViewerEngine(taskList, appState, ref);   │
 * │                                                                         │
 * └──────────────────────────┬──────────────────────┬───────────────────────┘
 *                            │                      │
 *              INPUTS (React → Engine)    OUTPUTS (Engine → React)
 *                            │                      │
 *                            ▼                      │
 * ┌──────────────────────────────────────┐          │
 * │  setGraph(taskList)                  │          │
 * │  ─────────────────                   │          │
 * │  Primary data source. Graph topology │          │
 * │  and node properties from the API.   │          │
 * │  Processed: nest → components →      │          │
 * │             baseStyle → conditional  │          │
 * └──────────────────────────────────────┘          │
 *                            │                      │
 *                            ▼                      │
 * ┌──────────────────────────────────────┐          │
 * │  setAppState(appState)               │          │
 * │  ─────────────────────               │          │
 * │  Secondary reactive source. UI state │          │
 * │  owned by React (cursor, selection). │          │
 * │  Applied per-frame in the loop.      │          │
 * └──────────────────────────────────────┘          │
 *                            │                      │
 *                            ▼                      │
 * ┌─────────────────────────────────────────────────┴───────────────────────┐
 * │                         ANIMATION LOOP                                  │
 * │                                                                         │
 * │   tick() runs every frame via requestAnimationFrame:                   │
 * │                                                                         │
 * │   1. SIMULATE  - Compute node positions (world space)                  │
 * │   2. STYLE     - Apply cursor/selection styling from appState          │
 * │   3. NAVIGATE  - Compute view transform (pan/zoom)                     │
 * │   4. RENDER    - Draw to SVG                                           │
 * │                                                                         │
 * │   Also handles: user input (drag, pan, zoom), initial fit              │
 * │                                                                         │
 * └─────────────────────────────────────────────────┬───────────────────────┘
 *                                                   │
 *                                                   ▼
 *                            ┌──────────────────────────────────────┐
 *                            │  onStateChange(engineState)          │
 *                            │  ──────────────────────────          │
 *                            │  Callback to push state to React.    │
 *                            │  Called via emitState() when         │
 *                            │  UI-relevant state changes.          │
 *                            │                                      │
 *                            │  Current fields:                     │
 *                            │  - isSimulating: boolean             │
 *                            │                                      │
 *                            │  Future fields (add as needed):      │
 *                            │  - hoveredNodeId: string | null      │
 *                            │  - selectedNodeId: string | null     │
 *                            │  - viewport bounds for overlays      │
 *                            │                                      │
 *                            │  ⚠️  THROTTLE: Don't emit every      │
 *                            │  frame or you'll get 60 re-renders/s │
 *                            └──────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SUMMARY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * INPUTS (React → Engine):
 *   - taskList    via setGraph()     → Graph data from API
 *   - appState    via setAppState()  → UI state (cursor, selection)
 *
 * OUTPUTS (Engine → React):
 *   - engineState via onStateChange() → Hover, selection, simulation status
 *
 * INTERNAL (not exposed to React):
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
import { CursorNeighbors, GraphViewerEngineState } from "./GraphViewerEngineState";
import { AppState, INITIAL_APP_STATE } from "./types";
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

/**
 * Callback type for pushing state updates back to React.
 */
export type EngineStateCallback = (state: GraphViewerEngineState) => void;

/**
 * Options for GraphViewerEngine.
 */
export interface GraphViewerEngineOptions {
    onNodeClick?: (nodeId: string) => void;
}

function calculateCursorNeighbors<G extends PositionedGraphData<any>>(graphData: G, cursor: string): CursorNeighbors {
    throw new Error("Not implemented yet");
}

/**
 * GraphViewerEngine - Imperative class that owns the animation loop.
 * See top-level comment for full data flow documentation.
 */
export class GraphViewerEngine {
    private animationFrameId: number | null = null;
    private frameCount = 0;
    private lastFrameTime = 0;
    private isSimulating = true;
    private svg: SVGSVGElement;

    // Graph data: processed and ready for simulation (set via setGraph())
    private graphData: ProcessedGraphData | null = null;

    // App state: UI state like cursor, selection, etc. (set via setAppState())
    private appState: AppState = INITIAL_APP_STATE;

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

    private currentCursorNeighbors: CursorNeighbors = {
        topological: {
            children: [],
            parents: [],
            peers: {},
        },
    };

    constructor(
        private container: HTMLDivElement,
        private onStateChange: EngineStateCallback,
        options?: GraphViewerEngineOptions
    ) {
        console.log("[GraphViewerEngine] Created, starting animation loop");

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
            // componentPadding: 10,
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
            onNodeClick: options?.onNodeClick,
        });
        this.inputHandler.setCallback((event) => {
            this.interactionController.handleEvent(event);
        });

        this.lastFrameTime = performance.now();
        this.startLoop();

        // Enable performance monitor by default
        this.setPerformanceMonitor(true);

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
     * Update the app state. This is the secondary reactive source.
     * Call this when UI state changes (cursor, selection, etc.)
     *
     * @param appState - New app state from React
     */
    setAppState(appState: AppState): void {
        this.appState = appState;
        // Note: Could trigger immediate effects here if needed
        // For now, the animation loop will pick up the new state
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
     * Push current state to React.
     * Call this when something UI-relevant changes (selection, hover, etc.)
     */
    private emitState(): void {
        this.onStateChange({
            isSimulating: this.isSimulating,
            cursorNeighbors: this.currentCursorNeighbors,
        });
    }

    /**
     * Emits event for relevant neighbors of the node on cursor. 
     */
    private updateRelevantNeighbors(positionedData: PositionedGraphData<any>): void {
        const { cursor } = this.appState;
        // TODO: Use the calculation function, compare with current, if changed, apply and emit.
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
            // STEP 1.6: Apply AppState styling (cursor, selection, etc.)
            //
            // AppState is the secondary reactive source. Apply styling
            // based on current UI state (cursor highlight, etc.)
            // ─────────────────────────────────────────────────────────────
            const styledData = cursorStyleGraphData(positionedData, this.appState);

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
        this.isSimulating = false;
        this.emitState();

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

// ═══════════════════════════════════════════════════════════════════════════
// TODO: Hoist UI state (selection, cursor) to React level
// ═══════════════════════════════════════════════════════════════════════════
//
// React should maintain UI state (selectedNodeId, cursorNodeId, etc.) and
// inject it into the data before calling setGraph(). The engine stays pure:
// just processes whatever data it receives. Selection state can then affect
// both styling AND navigation (focus on selected node).
// ═══════════════════════════════════════════════════════════════════════════
