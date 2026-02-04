/**
 * GraphViewerEngine - Imperative animation loop for graph visualization.
 * Owns simulation, navigation, and rendering.
 */

import { TaskListOut } from "todo-client";
import { CursorNeighbors, computeCursorNeighbors, EMPTY_CURSOR_NEIGHBORS } from "./GraphViewerEngineState";
import { GraphNavigationHandle, DEFAULT_NAV_MAPPING } from "./graphNavigation/types";
import { GraphNavigationController } from "./graphNavigation/GraphNavigationController";
import { navigationStyleGraphData } from "./preprocess/navigationStyleGraphData";
import { cursorStyleGraphData } from "./preprocess/styleGraphData";
import { preprocessGraph, ProcessedGraphData } from "./preprocess/pipeline";
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
} from "./navigation";
import { CursorFollowNavigationEngine } from "./navigation/engines";
import { SVGRenderer } from "./render/SVGRenderer";
import { PerformanceMonitor } from "./render/PerformanceMonitor";
import { InputHandler, InteractionController } from "./input";
import { PositionedGraphData } from "./simulation/utils";

const DEFAULT_SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** Abstract base for graph viewer engines. Defines constructor contract and public API. */
export abstract class AbstractGraphViewerEngine {
    constructor(
        protected container: HTMLDivElement,
        protected getCursor: () => string | null,
        protected setCursor: (nodeId: string | null) => void,
        protected setNavInfoText: (text: string | null) => void
    ) {}

    abstract setGraph(taskList: TaskListOut): void;
    abstract getNavigationHandle(): GraphNavigationHandle;
    abstract destroy(): void;
}

export class GraphViewerEngine extends AbstractGraphViewerEngine {
    private animationFrameId: number | null = null;
    private frameCount = 0;
    private lastFrameTime = 0;
    private svg: SVGSVGElement;

    private graphData: ProcessedGraphData | null = null;
    private simulationEngine: SimulationEngine;
    private simulationState: SimulationState = EMPTY_SIMULATION_STATE;
    private navigationEngine: NavigationEngine;
    private navigationState: NavigationState = INITIAL_NAVIGATION_STATE;
    private renderer: SVGRenderer;
    private inputHandler: InputHandler;
    private interactionController: InteractionController;
    private performanceMonitor: PerformanceMonitor | null = null;

    private navigationController: GraphNavigationController;
    private currentCursorNeighbors: CursorNeighbors = EMPTY_CURSOR_NEIGHBORS;

    constructor(
        container: HTMLDivElement,
        getCursor: () => string | null,
        setCursor: (nodeId: string | null) => void,
        setNavInfoText: (text: string | null) => void
    ) {
        super(container, getCursor, setCursor, setNavInfoText);
        // Navigation controller
        this.navigationController = new GraphNavigationController(
            DEFAULT_NAV_MAPPING,
            DEFAULT_SELECTORS,
            setCursor,
            setNavInfoText
        );

        // SVG setup
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
        this.container.appendChild(this.svg);

        // Subsystems
        this.renderer = new SVGRenderer(this.svg);
        this.simulationEngine = new WebColaEngine({
            flowDirection: "x",
            flowSeparation: 100,
            symmetricDiffLinkLengths: true,
            flowReversed: true,
            componentGrouping: true,
        });
        this.navigationEngine = new CursorFollowNavigationEngine();

        // Input handling
        this.inputHandler = new InputHandler(this.svg);
        this.interactionController = new InteractionController({
            getSimulationEngine: () => this.simulationEngine,
            setSimulationEngine: (engine) => this.setSimulationEngine(engine),
            getNavigationEngine: () => this.navigationEngine,
            setNavigationEngine: (engine) => this.setNavigationEngine(engine),
            getNavigationState: () => this.navigationState,
            getSimulationState: () => this.simulationState,
            onNodeClick: (nodeId) => setCursor(nodeId),
        });
        this.inputHandler.setCallback((event) => this.interactionController.handleEvent(event));

        this.lastFrameTime = performance.now();
        this.startLoop();
    }

    setGraph(taskList: TaskListOut): void {
        this.graphData = preprocessGraph(taskList);
    }

    getNavigationHandle(): GraphNavigationHandle {
        return this.navigationController.handle;
    }

    private setSimulationEngine(engine: SimulationEngine): void {
        this.simulationEngine.destroy?.();
        this.simulationEngine = engine;
    }

    private setNavigationEngine(engine: NavigationEngine): void {
        this.navigationEngine.destroy?.();
        this.navigationEngine = engine;
    }

    private setPerformanceMonitor(enabled: boolean, panel: 0 | 1 | 2 = 0): void {
        if (enabled && !this.performanceMonitor) {
            this.performanceMonitor = new PerformanceMonitor(this.container, panel);
        } else if (!enabled && this.performanceMonitor) {
            this.performanceMonitor.destroy();
            this.performanceMonitor = null;
        } else if (enabled && this.performanceMonitor) {
            this.performanceMonitor.showPanel(panel);
        }
    }

    private getViewport(): ViewportInfo {
        return {
            width: this.container.clientWidth || 800,
            height: this.container.clientHeight || 600,
        };
    }

    private updateCursorNeighbors(positionedData: PositionedGraphData<any>): void {
        const cursor = this.getCursor();

        // Build positions map
        const positions: { [key: string]: [number, number] } = {};
        for (const [taskId, task] of Object.entries(positionedData.tasks)) {
            const pos = (task as any).position;
            if (pos) positions[taskId] = pos;
        }

        const newNeighbors = computeCursorNeighbors(cursor, positionedData.dependencies, positions);

        // Only update if changed
        if (JSON.stringify(this.currentCursorNeighbors) !== JSON.stringify(newNeighbors)) {
            this.currentCursorNeighbors = newNeighbors;
            this.navigationController.setCursorNeighbors(newNeighbors);
        }
    }

    private startLoop(): void {
        const tick = (currentTime: number) => {
            this.performanceMonitor?.begin();
            this.frameCount++;
            const deltaTime = currentTime - this.lastFrameTime;
            this.lastFrameTime = currentTime;

            if (!this.graphData) {
                this.performanceMonitor?.end();
                this.animationFrameId = requestAnimationFrame(tick);
                return;
            }

            // 1. Simulate positions
            this.simulationState = this.simulationEngine.step(
                { graph: this.graphData, deltaTime },
                this.simulationState
            );
            const positionedData = mergePositions(this.graphData, this.simulationState);

            // 2. Update cursor neighbors (for navigation)
            this.updateCursorNeighbors(positionedData);

            // 3. Apply styling
            const cursor = this.getCursor();
            let styledData = cursorStyleGraphData(positionedData, cursor);
            styledData = navigationStyleGraphData(
                styledData,
                this.currentCursorNeighbors,
                this.navigationController.state,
                DEFAULT_SELECTORS,
                DEFAULT_NAV_MAPPING
            );

            // 4. Navigate (pan/zoom)
            this.navigationState = this.navigationEngine.step(
                { graph: styledData, viewport: this.getViewport(), deltaTime },
                this.navigationState
            );

            // 5. Render
            this.renderer.render(styledData, this.navigationState.transform);

            this.performanceMonitor?.end();
            this.animationFrameId = requestAnimationFrame(tick);
        };

        this.animationFrameId = requestAnimationFrame(tick);
    }

    destroy(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.inputHandler.destroy();
        this.interactionController.destroy();
        this.simulationEngine.destroy?.();
        this.navigationEngine.destroy?.();
        this.renderer.clear();
        this.performanceMonitor?.destroy();
        this.svg.remove();
    }
}
