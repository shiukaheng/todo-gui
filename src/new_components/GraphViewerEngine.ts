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

/**
 * Callback type for pushing state updates back to React.
 */
export type EngineStateCallback = (state: GraphViewerEngineState) => void;

/**
 * GraphViewerEngine - Imperative class that owns the animation loop.
 *
 * Data pipeline (each frame):
 *   Raw Neo4j data → nest → style → position → render
 *
 * The simulation engine is pluggable via setSimulationEngine().
 * When switching engines, the current positions are preserved.
 */
export class GraphViewerEngine {
    private animationFrameId: number | null = null;
    private frameCount = 0;
    private isSimulating = true;
    private svg: SVGSVGElement;

    // Simulation
    private simulationEngine: SimulationEngine;
    private simulationState: SimulationState = EMPTY_SIMULATION_STATE;

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

        // Default to random-init engine (no actual layout, just places nodes)
        this.simulationEngine = createRandomInitEngine(100);

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
        const tick = () => {
            this.frameCount++;

            // ─────────────────────────────────────────────────────────────
            // STEP 1: Read raw data from React (comes directly from Neo4j)
            // ─────────────────────────────────────────────────────────────
            const { data, isNew, version } = this.dataSource.read();

            // ─────────────────────────────────────────────────────────────
            // STEP 2: Nest - wrap raw node properties in `.data` so we can
            // add GUI-specific properties without key collisions. Pure fn.
            // ─────────────────────────────────────────────────────────────
            const nestedData = nestGraphData(data);

            // ─────────────────────────────────────────────────────────────
            // STEP 3: Style - derive visual attributes (colors, etc.) from
            // the original node data. Adds well-defined style props. Pure fn.
            // ─────────────────────────────────────────────────────────────
            const styledData = styleGraphData(nestedData);

            // ─────────────────────────────────────────────────────────────
            // STEP 4: Position - add x,y coordinates from simulation engine.
            //
            // Pipeline:
            //   a) Extract topology: graph -> { nodeIds, edges }
            //   b) Step simulation:  (topology, prevState) -> nextState
            //   c) Merge positions:  (styledData, positions) -> positionedData
            // ─────────────────────────────────────────────────────────────
            const topology = extractTopology(styledData);
            this.simulationState = this.simulationEngine.step(topology, this.simulationState);
            const positionedData = mergePositions(styledData, this.simulationState);

            // ─────────────────────────────────────────────────────────────
            // STEP 5: Render (TODO)
            // ─────────────────────────────────────────────────────────────

            // ─────────────────────────────────────────────────────────────
            // STEP 6: Navigation module (TODO - not settable externally)
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
