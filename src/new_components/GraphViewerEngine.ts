import { TaskListOut } from "todo-client";
import { DataSource } from "./DataSource";
import { GraphViewerEngineState } from "./GraphViewerEngineState";
import { nestGraphData } from "../new_utils/nestGraphData";
import { styleGraphData } from "./styleGraphData";
import {
    SimulationEngine,
    SimulationState,
    EMPTY_SIMULATION_STATE,
    mergePositions,
    WebColaEngine,
} from "./simulation";
import { ForceDirectedEngine } from "./simulation/engines/forceDirectedEngine";
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
 * Data pipeline (each frame):
 *   Raw Neo4j data → nest → style → position → navigate → render
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
        private dataSource: DataSource<TaskListOut>,
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

        // Default simulation: force-directed layout
        // this.simulationEngine = new ForceDirectedEngine();
        this.simulationEngine = new WebColaEngine();

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

            // ─────────────────────────────────────────────────────────────
            // STEP 1: Read raw data from React (comes directly from Neo4j)
            //
            // The DataSource is a bridge from React's declarative world.
            // It holds the latest task list and tracks whether data changed.
            // ─────────────────────────────────────────────────────────────
            const { data, isNew, version } = this.dataSource.read();

            // ─────────────────────────────────────────────────────────────
            // STEP 2: Nest - wrap raw node properties in `.data`
            //
            // Raw Neo4j data has properties directly on nodes. We wrap them
            // in a `.data` property so we can add GUI-specific properties
            // (style, position, etc.) without key collisions. Pure function.
            // ─────────────────────────────────────────────────────────────
            const nestedData = nestGraphData(data);

            // ─────────────────────────────────────────────────────────────
            // STEP 3: Style - derive visual attributes from node data
            //
            // Based on node properties (completed, priority, etc.), compute
            // visual styling (colors, opacity, etc.). Pure function.
            // ─────────────────────────────────────────────────────────────
            const styledData = styleGraphData(nestedData);

            // ─────────────────────────────────────────────────────────────
            // STEP 4: Simulate - compute world-space positions
            //
            // The simulation engine determines WHERE nodes should be laid
            // out in an abstract "world space" coordinate system.
            //
            // Receives full graph so it can access any node/edge properties
            // (e.g., weight nodes by priority). Extracts what it needs internally.
            //
            // The engine is stateful (may track velocities internally) but
            // has a functional interface. Positions are portable across
            // different engine implementations.
            // ─────────────────────────────────────────────────────────────
            this.simulationState = this.simulationEngine.step(
                { graph: styledData, deltaTime },
                this.simulationState
            );
            const positionedData = mergePositions(styledData, this.simulationState);

            // ─────────────────────────────────────────────────────────────
            // STEP 5: Navigate - compute world → screen transform
            //
            // The navigator determines HOW we VIEW the world space:
            // - Which region is visible (pan)
            // - At what scale (zoom)
            // - Optionally animated transitions
            //
            // Receives full positioned graph so it can access any node
            // properties (e.g., focus on selected/highlighted nodes).
            //
            // This produces a ViewTransform (2D affine matrix) that maps
            // world coordinates to screen pixels. Different navigators
            // enable different behaviors:
            // - FitNavigator: auto-fit all content
            // - StaticNavigator: preserve current view
            //
            // The navigator is stateful (may track animation progress) but
            // has a functional interface. The transform is portable.
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
            // STEP 6: Render - draw to SVG
            //
            // The renderer takes positioned graph data and the view transform,
            // then draws/updates SVG elements. Uses reconciliation to minimize
            // DOM operations (only updates changed elements).
            //
            // This is a terminal side effect - no state produced.
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
// Features like a "node cursor" (keyboard navigation, selection highlighting)
// should NOT live inside GraphViewerEngine. Instead:
//
// 1. Move nestGraphData() call to React level (in the component or hook)
// 2. React maintains UI state: selectedNodeId, hoveredNodeId, cursorNodeId, etc.
// 3. React injects these as extra properties on nested nodes BEFORE passing
//    to the engine's DataSource
//
// Example flow:
//   ```tsx
//   // In React component:
//   const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
//
//   const nestedData = useMemo(() => {
//       const nested = nestGraphData(taskList);
//       return {
//           ...nested,
//           nodes: nested.nodes.map(node => ({
//               ...node,
//               isSelected: node.id === selectedNodeId,
//               isCursor: node.id === cursorNodeId,
//           }))
//       };
//   }, [taskList, selectedNodeId, cursorNodeId]);
//
//   // Pass pre-nested data to engine
//   dataSource.set(nestedData);
//   ```
//
// Benefits:
// - React handles complex UI state (keyboard nav, multi-select, etc.)
// - Engine stays pure: just processes whatever data it receives
// - Selection state can affect both styling AND navigation (focus on selected)
// - Clear separation: React = state management, Engine = rendering
//
// The engine then just reads these properties in styleGraphData() and
// navigator can read focusNodeId from the input.
// ═══════════════════════════════════════════════════════════════════════════
