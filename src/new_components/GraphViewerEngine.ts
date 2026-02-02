import { TaskListOut } from "todo-client";
import { GraphViewerEngineState } from "./GraphViewerEngineState";
import { nestGraphData } from "../new_utils/nestGraphData";
import { styleGraphData, StyledGraphData } from "./styleGraphData";
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
} from "./navigation";
import { FitNavigator } from "./navigation/navigators/fitNavigator";
import { SVGRenderer } from "./SVGRenderer";
import { PerformanceMonitor } from "./PerformanceMonitor";

/**
 * Callback type for pushing state updates back to React.
 */
export type EngineStateCallback = (state: GraphViewerEngineState) => void;

/**
 * GraphViewerEngine - Imperative class that owns the animation loop.
 *
 * Data flow:
 *   setGraph(rawData) → nest → components → style → graphData (cached)
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

    // Performance monitoring (optional)
    private performanceMonitor: PerformanceMonitor | null = null;

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
            flowDirection: "y",
            flowSeparation: 50,
            symmetricDiffLinkLengths: true,
        });

        // Default navigation: auto-fit content in viewport
        this.navigator = new FitNavigator({ padding: 40, animationDuration: 300 });

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
        const styled = styleGraphData(withComponents);
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
