import { TaskListOut } from "todo-client";
import { DataSource } from "./DataSource";
import { GraphViewerEngineState } from "./GraphViewerEngineState";
import { nestGraphData } from "../new_utils/nestGraphData";
import { styleGraphData } from "./styleGraphData";
import {
    SimulationEngine,
    SimulationState,
    EMPTY_SIMULATION_STATE,
    extractTopology,
    mergePositions,
} from "./simulation";
import { createRandomInitEngine } from "./simulation/engines/nullEngine";
import {
    Navigator,
    NavigationState,
    INITIAL_NAVIGATION_STATE,
    ViewportInfo,
} from "./navigation";
import { calculateWorldBounds, fitBoundsToViewport } from "./navigation/utils";
import { createFitNavigator } from "./navigation/navigators/fitNavigator";

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

        // Default simulation: random positions (no actual layout)
        this.simulationEngine = createRandomInitEngine(100);

        // Default navigation: auto-fit content in viewport
        this.navigator = createFitNavigator({ padding: 40, animationDuration: 300 });

        this.lastFrameTime = performance.now();
        this.startLoop();
    }

    /**
     * Replace the simulation engine.
     * Current positions are preserved and passed to the new engine.
     */
    setSimulationEngine(engine: SimulationEngine): void {
        this.simulationEngine.reset();
        this.simulationEngine = engine;
        // simulationState (positions) is preserved automatically -
        // new engine will receive it on next step() call
    }

    /**
     * Replace the navigator.
     * Current view transform is preserved and passed to the new navigator.
     */
    setNavigator(navigator: Navigator): void {
        this.navigator.reset();
        this.navigator = navigator;
        // navigationState (transform) is preserved automatically -
        // new navigator will receive it on next step() call
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
            // Pipeline:
            //   a) extractTopology: graph -> { nodeIds, edges }
            //   b) engine.step: (topology, prevPositions) -> newPositions
            //   c) mergePositions: (styledData, positions) -> positionedData
            //
            // The engine is stateful (may track velocities internally) but
            // has a functional interface. Positions are portable across
            // different engine implementations.
            // ─────────────────────────────────────────────────────────────
            const topology = extractTopology(styledData);
            this.simulationState = this.simulationEngine.step(topology, this.simulationState);
            const positionedData = mergePositions(styledData, this.simulationState);

            // ─────────────────────────────────────────────────────────────
            // STEP 5: Navigate - compute world → screen transform
            //
            // The navigator determines HOW we VIEW the world space:
            // - Which region is visible (pan)
            // - At what scale (zoom)
            // - Optionally animated transitions
            //
            // This produces a ViewTransform (2D affine matrix) that maps
            // world coordinates to screen pixels. Different navigators
            // enable different behaviors:
            // - FitNavigator: auto-fit all content
            // - StaticNavigator: manual pan/zoom (Google Maps style)
            // - FocusNavigator: track a specific node
            //
            // The navigator is stateful (may track animation progress) but
            // has a functional interface. The transform is portable.
            // ─────────────────────────────────────────────────────────────
            const worldBounds = calculateWorldBounds(this.simulationState);
            if (worldBounds) {
                this.navigationState = this.navigator.step(
                    {
                        worldBounds,
                        viewport: this.getViewport(),
                        deltaTime,
                    },
                    this.navigationState
                );
            }

            // ─────────────────────────────────────────────────────────────
            // STEP 6: Render (TODO)
            //
            // Apply the navigation transform to node positions and render
            // to SVG. The renderer receives:
            // - positionedData: nodes with world-space x,y
            // - navigationState.transform: world → screen matrix
            // ─────────────────────────────────────────────────────────────

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
