import { TaskListOut } from "todo-client";
import { GraphViewerEngineState } from "./GraphViewerEngineState";
import { nestGraphData } from "../new_utils/nestGraphData";
import { baseStyleGraphData, conditionalStyleGraphData, StyledGraphData } from "./styleGraphData";
import { computeConnectedComponents, ComponentGraphData } from "./connectedComponents";
import { NestedGraphData } from "../new_utils/nestGraphData";

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
    Navigator,
    NavigationState,
    INITIAL_NAVIGATION_STATE,
    ViewportInfo,
    createPanZoomTransform,
} from "./navigation";
import { ManualNavigator } from "./navigation/navigators/manualNavigator";
import { SVGRenderer } from "./SVGRenderer";
import { PerformanceMonitor } from "./PerformanceMonitor";
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
 * GraphViewerEngine - Imperative class that owns the animation loop.
 *
 * Data flow:
 *   setGraph(rawData) → nest → components → baseStyle → conditionalStyle → graphData (cached)
 *   tick() → simulate → navigate → render
 *
 * Two pluggable systems:
 * - SimulationEngine: determines WHERE nodes are in world space
 * - Navigator: determines HOW we VIEW the world (pan/zoom transform)
 */
export class GraphViewerEngine {
    private animationFrameId: number | null = null;
    private frameCount = 0;
    private lastFrameTime = 0;
    private isSimulating = true;
    private svg: SVGSVGElement;

    // Graph data: processed and ready for simulation (set via setGraph())
    private graphData: ProcessedGraphData | null = null;

    // Simulation: computes node positions in world space
    private simulationEngine: SimulationEngine;
    private simulationState: SimulationState = EMPTY_SIMULATION_STATE;

    // Navigation: computes world → screen transform
    private navigator: Navigator;
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

    constructor(
        private container: HTMLDivElement,
        private onStateChange: EngineStateCallback
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
        this.navigator = new ManualNavigator();

        // Set up input handling
        this.inputHandler = new InputHandler(this.svg);
        this.interactionController = new InteractionController({
            getSimulationEngine: () => this.simulationEngine,
            setSimulationEngine: (engine) => this.setSimulationEngine(engine),
            getNavigator: () => this.navigator,
            setNavigator: (navigator) => this.setNavigator(navigator),
            getNavigationState: () => this.navigationState,
            getSimulationState: () => this.simulationState,
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
     * Replace the simulation engine.
     * Current positions are preserved and passed to the new engine.
     * The old engine is destroyed if it has a destroy method.
     */
    setSimulationEngine(engine: SimulationEngine): void {
        this.simulationEngine.destroy?.();
        this.simulationEngine = engine;
    }

    /**
     * Replace the navigator.
     * Current view transform is preserved and passed to the new navigator.
     * The old navigator is destroyed if it has a destroy method.
     */
    setNavigator(navigator: Navigator): void {
        this.navigator.destroy?.();
        this.navigator = navigator;
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
        });
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
            // STEP 2: Navigate - compute world → screen transform
            //
            // The navigator determines HOW we view the world: pan, zoom,
            // and optionally animated transitions. Produces a ViewTransform
            // (2D affine matrix) that maps world coordinates to screen pixels.
            // ─────────────────────────────────────────────────────────────
            this.navigationState = this.navigator.step(
                {
                    graph: positionedData,
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
            this.renderer.render(positionedData, this.navigationState.transform);

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
        this.navigator.destroy?.();
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
