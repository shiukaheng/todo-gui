/**
 * GraphViewerEngine - Imperative animation loop for graph visualization.
 * Owns simulation, navigation, and rendering.
 */

import { AppState, NodeListOut } from "todo-client";
import { CursorNeighbors, computeCursorNeighbors, cursorNeighborsEqual, EMPTY_CURSOR_NEIGHBORS } from "./GraphViewerEngineState";
import { GraphNavigationHandle, DEFAULT_NAV_MAPPING } from "./graphNavigation/types";
import { GraphNavigationController } from "./graphNavigation/GraphNavigationController";
import { navigationStyleGraphData } from "./preprocess/navigationStyleGraphData";
import { cursorStyleGraphData } from "./preprocess/styleGraphData";
import { preprocessGraph, ProcessedGraphData } from "./preprocess/pipeline";
import { preprocessPlans, ProcessedPlansData, EMPTY_PLANS_DATA } from "./preprocess/preprocessPlans";
import { stylePlans, StyledPlansData } from "./preprocess/stylePlans";
import {
    SimulationEngine,
    SimulationState,
    EMPTY_SIMULATION_STATE,
    mergePositions,
    WebColaEngine,
    ForceDirectedEngine,
} from "./simulation";
import { PositionPersistenceManager } from "./simulation/PositionPersistenceManager";
import {
    NavigationEngine,
    NavigationState,
    INITIAL_NAVIGATION_STATE,
    ViewportInfo,
} from "./navigation";
import { screenToWorld } from "./navigation/utils";
import {
    ManualNavigationEngine,
    CursorFollowNavigationEngine,
    AutoNavigationEngine,
    FlyNavigationEngine,
} from "./navigation/engines";
import { FlyNavigationHandle, isFlyNavigationEngine } from "./navigation/types";
import { SVGRenderer } from "./render/SVGRenderer";
import { PerformanceMonitor } from "./render/PerformanceMonitor";
import { InputHandler, InteractionController } from "./input";
import { PositionedGraphData } from "./simulation/utils";
import { useTodoStore, NavigationMode, SimulationMode } from "../stores/todoStore";
import { viewTrace } from "../utils/viewTrace";

const DEFAULT_SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** Abstract base for graph viewer engines. Defines constructor contract and public API. */
export abstract class AbstractGraphViewerEngine {
    constructor(
        protected container: HTMLDivElement,
        protected getCursor: () => string | null,
        protected setCursor: (nodeId: string | null) => void,
        protected setNavInfoText: (text: string | null) => void
    ) {}

    abstract updateState(appState: AppState): void;
    abstract getNavigationHandle(): GraphNavigationHandle;
    abstract getFlyNavigationHandle(): FlyNavigationHandle | null;
    abstract destroy(): void;
}

export class GraphViewerEngine extends AbstractGraphViewerEngine {
    private animationFrameId: number | null = null;
    private frameCount = 0;
    private lastFrameTime = 0;
    private svg: SVGSVGElement;

    private graphData: ProcessedGraphData | null = null;
    private lastAppState: AppState | null = null;
    private currentFilterNodeIds: string[] | null = null;
    private currentBlacklistNodeIds: string[] | null = null;
    private currentViewId: string;
    private plansData: ProcessedPlansData = EMPTY_PLANS_DATA;
    private styledPlansData: StyledPlansData = { plans: {} };
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

    private currentNavigationMode: NavigationMode;
    private currentSimulationMode: SimulationMode;
    private storeUnsubscribe: (() => void) | null = null;

    private positionPersistence: PositionPersistenceManager;

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
            setNavInfoText,
            () => this.selectNearestToCenter(),
        );

        // SVG setup
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
        this.container.appendChild(this.svg);

        // Subsystems
        this.renderer = new SVGRenderer(this.svg);

        this.positionPersistence = new PositionPersistenceManager();

        // Initialize view ID
        const initialStoreState = useTodoStore.getState();
        this.currentViewId = initialStoreState.currentViewId;

        // Initialize simulation engine based on store mode
        this.currentSimulationMode = useTodoStore.getState().simulationMode;
        this.simulationEngine = this.createSimulationEngine(this.currentSimulationMode);

        // Initialize navigation engine based on store mode
        this.currentNavigationMode = useTodoStore.getState().navigationMode;
        this.navigationEngine = this.createNavigationEngine(this.currentNavigationMode);

        // Subscribe to mode and filter changes
        this.storeUnsubscribe = useTodoStore.subscribe(
            (state) => {
                if (state.navigationMode !== this.currentNavigationMode) {
                    this.currentNavigationMode = state.navigationMode;
                    this.setNavigationEngine(this.createNavigationEngine(state.navigationMode));
                }
                if (state.simulationMode !== this.currentSimulationMode) {
                    this.currentSimulationMode = state.simulationMode;
                    this.setSimulationEngine(this.createSimulationEngine(state.simulationMode));
                }
                if (state.currentViewId !== this.currentViewId) {
                    const prevViewId = this.currentViewId;
                    const nextViewId = state.currentViewId;
                    const nextFilter = state.filterNodeIds;
                    const nextBlacklist = state.blacklistNodeIds;
                    viewTrace('Graph', 'viewChange:detected', {
                        prevViewId,
                        nextViewId,
                        nextFilterCount: nextFilter?.length ?? 0,
                        nextBlacklistCount: nextBlacklist?.length ?? 0,
                    });
                    this.onViewChange(prevViewId, nextFilter, nextBlacklist);
                    this.currentViewId = nextViewId;
                    this.currentFilterNodeIds = nextFilter;
                    this.currentBlacklistNodeIds = nextBlacklist;
                    return;
                }
                if (state.filterNodeIds !== this.currentFilterNodeIds) {
                    this.onFilterChange(this.currentFilterNodeIds, state.filterNodeIds);
                    this.currentFilterNodeIds = state.filterNodeIds;
                }
                if (state.blacklistNodeIds !== this.currentBlacklistNodeIds) {
                    this.currentBlacklistNodeIds = state.blacklistNodeIds;
                    if (this.lastAppState) {
                        this.processGraphData(this.lastAppState, false);
                    }
                }
            }
        );

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
            onCanvasTap: () => {
                const state = useTodoStore.getState();
                if (state.commandPlaneVisible) {
                    state.hideCommandPlane();
                } else {
                    state.showCommandPlane();
                }
            },
        });
        this.inputHandler.setCallback((event) => this.interactionController.handleEvent(event));

        this.positionPersistence.start(() => this.simulationState);

        this.lastFrameTime = performance.now();
        this.startLoop();
    }

    updateState(appState: AppState): void {
        this.lastAppState = appState;
        viewTrace('Graph', 'updateState:process', {
            viewId: this.currentViewId,
            taskCount: Object.keys(appState.tasks).length,
            depCount: Object.keys(appState.dependencies).length,
        });
        this.processGraphData(appState, !this.currentFilterNodeIds);
    }

    /**
     * Process app state into graph data, optionally applying the active filter.
     * @param restorePositions - Whether to restore saved positions from storage
     */
    private processGraphData(appState: AppState, restorePositions: boolean): void {
        viewTrace('Graph', 'processGraphData:start', {
            viewId: this.currentViewId,
            restorePositions,
            inputTasks: Object.keys(appState.tasks).length,
            inputDeps: Object.keys(appState.dependencies).length,
            filterCount: this.currentFilterNodeIds?.length ?? 0,
            blacklistCount: this.currentBlacklistNodeIds?.length ?? 0,
        });
        // Apply client-side filter if active
        const taskList = this.applyFilter({
            tasks: appState.tasks,
            dependencies: appState.dependencies,
            hasCycles: appState.hasCycles,
        });

        // Preprocess graph data (tasks + dependencies)
        const graphData = preprocessGraph(taskList);
        this.graphData = graphData;

        // Preprocess and style plans data
        const validNodeIds = new Set(Object.keys(graphData.tasks));
        this.plansData = preprocessPlans(appState.plans, validNodeIds);

        // Style plans once (no need to do per-frame)
        this.styledPlansData = stylePlans(this.plansData);

        // Load and validate saved positions when graph is set
        if (restorePositions) {
            this.restorePositionsFromStorage(validNodeIds);
        }
        viewTrace('Graph', 'processGraphData:done', {
            outputTasks: Object.keys(graphData.tasks).length,
            outputDeps: Object.keys(graphData.dependencies).length,
        });
    }

    /**
     * Load saved positions from server and apply if coverage is sufficient.
     */
    private restorePositionsFromStorage(currentNodeIds: Set<string>): void {
        const savedPositions = this.positionPersistence.loadPositions();

        // Filter out positions for nodes that no longer exist
        const validPositions: Record<string, { x: number; y: number }> = {};
        let invalidCount = 0;

        for (const [nodeId, pos] of Object.entries(savedPositions)) {
            if (currentNodeIds.has(nodeId)) {
                validPositions[nodeId] = pos;
            } else {
                invalidCount++;
            }
        }

        if (invalidCount > 0) {
            console.log(`[GraphViewer] Removed ${invalidCount} stale node positions`);
        }

        // Only use saved positions if we have good coverage of current nodes
        const coverageRatio = Object.keys(validPositions).length / currentNodeIds.size;
        if (coverageRatio > 0.5 && Object.keys(validPositions).length > 0) {
            this.simulationState = { positions: validPositions };
        } else if (Object.keys(savedPositions).length > 0) {
            console.log('[GraphViewer] Insufficient coverage, starting fresh layout');
        }
    }

    /**
     * Apply client-side filter (whitelist) and blacklist.
     * Whitelist: keep only filter root nodes and their recursive children.
     * Blacklist: remove specific nodes.
     * Returns the input unchanged if neither is active.
     */
    private applyFilter(taskList: NodeListOut): NodeListOut {
        const filterNodeIds = this.currentFilterNodeIds;
        const blacklistNodeIds = this.currentBlacklistNodeIds;
        const hasWhitelist = filterNodeIds && filterNodeIds.length > 0;
        const hasBlacklist = blacklistNodeIds && blacklistNodeIds.length > 0;

        if (!hasWhitelist && !hasBlacklist) {
            return taskList;
        }

        // Start with all nodes visible
        let visible = new Set<string>(Object.keys(taskList.tasks));

        // Apply whitelist: restrict to filter roots + recursive children
        if (hasWhitelist) {
            // Build parent → children adjacency from dependencies
            const childrenMap = new Map<string, string[]>();
            for (const dep of Object.values(taskList.dependencies)) {
                if (!childrenMap.has(dep.fromId)) childrenMap.set(dep.fromId, []);
                childrenMap.get(dep.fromId)!.push(dep.toId);
            }

            // BFS from filter roots
            visible = new Set<string>();
            const queue = [...filterNodeIds];
            while (queue.length > 0) {
                const nodeId = queue.shift()!;
                if (visible.has(nodeId)) continue;
                if (!taskList.tasks[nodeId]) continue;
                visible.add(nodeId);
                for (const childId of childrenMap.get(nodeId) || []) {
                    if (!visible.has(childId)) queue.push(childId);
                }
            }
        }

        // Apply blacklist: remove hidden nodes
        if (hasBlacklist) {
            for (const nodeId of blacklistNodeIds) {
                visible.delete(nodeId);
            }
        }

        // Filter tasks
        const filteredTasks: typeof taskList.tasks = {};
        for (const [id, task] of Object.entries(taskList.tasks)) {
            if (visible.has(id)) {
                filteredTasks[id] = task;
            }
        }

        // Filter dependencies: keep only edges where both ends are visible
        const filteredDeps: typeof taskList.dependencies = {};
        for (const [id, dep] of Object.entries(taskList.dependencies)) {
            if (visible.has(dep.fromId) && visible.has(dep.toId)) {
                filteredDeps[id] = dep;
            }
        }

        return {
            tasks: filteredTasks,
            dependencies: filteredDeps,
            hasCycles: taskList.hasCycles,
        };
    }

    /**
     * Handle filter state changes: save/restore positions and reprocess graph.
     */
    private onFilterChange(prevFilter: string[] | null, newFilter: string[] | null): void {
        viewTrace('Graph', 'filterChange', {
            prevCount: prevFilter?.length ?? 0,
            nextCount: newFilter?.length ?? 0,
            viewId: this.currentViewId,
        });
        if (newFilter !== null && prevFilter === null) {
            // Filter activated: save current positions, pause persistence
            this.positionPersistence.savePositionsNow();
        }
        this.updatePersistencePause();

        // Re-process graph data with new filter state
        if (this.lastAppState) {
            // When clearing filter, restore saved positions
            const shouldRestore = newFilter === null;
            this.currentFilterNodeIds = newFilter;
            this.processGraphData(this.lastAppState, shouldRestore);
        }
    }

    /**
     * Handle view switch: save current positions, then reload from new view.
     */
    private onViewChange(
        prevViewId: string,
        newFilter: string[] | null,
        newBlacklist: string[] | null,
    ): void {
        viewTrace('Graph', 'viewChange:start', {
            prevViewId,
            newViewId: this.currentViewId,
            newFilterCount: newFilter?.length ?? 0,
            newBlacklistCount: newBlacklist?.length ?? 0,
        });
        // Persist the current graph state into the previous view before switching.
        this.positionPersistence.savePositionsNow(prevViewId);

        this.currentFilterNodeIds = newFilter;
        this.currentBlacklistNodeIds = newBlacklist;
        this.updatePersistencePause();

        if (this.lastAppState) {
            this.processGraphData(this.lastAppState, true);
        }
        viewTrace('Graph', 'viewChange:done', {
            prevViewId,
        });
    }

    private updatePersistencePause(): void {
        const shouldPause = this.currentFilterNodeIds !== null;
        viewTrace('Graph', 'persistencePause', {
            shouldPause,
            filterCount: this.currentFilterNodeIds?.length ?? 0,
        });
        this.positionPersistence.setPaused(shouldPause);
    }

    getNavigationHandle(): GraphNavigationHandle {
        return this.navigationController.handle;
    }

    getFlyNavigationHandle(): FlyNavigationHandle | null {
        // Check for dedicated fly engine
        if (isFlyNavigationEngine(this.navigationEngine)) {
            return this.navigationEngine.handle;
        }
        // Check for auto engine with fly support
        if (this.navigationEngine instanceof AutoNavigationEngine) {
            return this.navigationEngine.flyHandle;
        }
        return null;
    }

    private setSimulationEngine(engine: SimulationEngine): void {
        this.simulationEngine.destroy?.();
        this.simulationEngine = engine;
    }

    private setNavigationEngine(engine: NavigationEngine): void {
        this.navigationEngine.destroy?.();
        this.navigationEngine = engine;
    }

    private createNavigationEngine(mode: NavigationMode): NavigationEngine {
        switch (mode) {
            case 'manual':
                return new ManualNavigationEngine();
            case 'follow':
                return new CursorFollowNavigationEngine();
            case 'fly': {
                const engine = new FlyNavigationEngine();
                engine.setCursorCallback((nodeId) => this.setCursor(nodeId));
                return engine;
            }
            case 'auto':
            default: {
                const engine = new AutoNavigationEngine();
                // Wire up cursor callback for fly mode within auto
                engine.setCursorCallback((nodeId) => this.setCursor(nodeId));
                return engine;
            }
        }
    }

    private createSimulationEngine(mode: SimulationMode): SimulationEngine {
        switch (mode) {
            case 'force':
                return new ForceDirectedEngine({
                    desiredEdgeLength: 100,
                    repulsionStrength: 5000,
                    tensionStrength: 0.05,
                });
            case 'cola':
            default:
                return new WebColaEngine({
                    flowDirection: "x",
                    flowSeparation: 100,
                    symmetricDiffLinkLengths: true,
                    flowReversed: true,
                    componentGrouping: true,
                });
        }
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

        if (!cursorNeighborsEqual(this.currentCursorNeighbors, newNeighbors)) {
            this.currentCursorNeighbors = newNeighbors;
            this.navigationController.setCursorNeighbors(newNeighbors);
        }
    }

    private selectNearestToCenter(): boolean {
        // Need positions from simulation state
        const positions = this.simulationState.positions;
        const nodeIds = Object.keys(positions);
        if (nodeIds.length === 0) return false;

        // Get screen center in world coordinates
        const viewport = this.getViewport();
        const screenCenter = { x: viewport.width / 2, y: viewport.height / 2 };
        const worldCenter = screenToWorld(screenCenter, this.navigationState.transform);

        // Find nearest node to world center
        let nearestId: string | null = null;
        let nearestDistSq = Infinity;

        for (const nodeId of nodeIds) {
            const pos = positions[nodeId];
            const dx = pos.x - worldCenter.x;
            const dy = pos.y - worldCenter.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestId = nodeId;
            }
        }

        if (nearestId) {
            this.setCursor(nearestId);
            return true;
        }
        return false;
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

            // 3. Apply styling (graph - per frame for cursor/navigation changes)
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
                {
                    graph: styledData,
                    viewport: this.getViewport(),
                    deltaTime,
                    isDraggingNode: this.interactionController.isDraggingNode()
                },
                this.navigationState
            );

            // 4.5. Update interaction controller (for drag position with simulation inertia)
            this.interactionController.updateFrame();

            // 5. Render (merge styled graph + cached styled plans)
            const renderData = {
                tasks: styledData.tasks,
                dependencies: styledData.dependencies,
                plans: this.styledPlansData.plans,
            };
            this.renderer.render(renderData, this.navigationState.transform);

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
        this.positionPersistence.stop();
        this.storeUnsubscribe?.();
        this.storeUnsubscribe = null;
        this.inputHandler.destroy();
        this.interactionController.destroy();
        this.simulationEngine.destroy?.();
        this.navigationEngine.destroy?.();
        this.renderer.clear();
        this.performanceMonitor?.destroy();
        this.svg.remove();
    }
}
