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
import { type Filter, EMPTY_FILTER } from "../stores/filterTypes";
import type { CompletedInfo } from "todo-client";
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
    private currentFilter: Filter = EMPTY_FILTER;
    private lastFilterKey = '';
    private initialPositionsFetched = false;
    private _positionState: 'undefined' | 'ready' = 'undefined';
    private _coreGraphPaused = true;
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

    /** Interval for periodic re-evaluation when hideCompletedFor is active */
    private hideCompletedIntervalId: ReturnType<typeof setInterval> | null = null;

    private setPositionState(next: 'undefined' | 'ready'): void {
        if (next !== this._positionState) {
            console.log(`[PosState] ${this._positionState} → ${next}`);
            this._positionState = next;
        }
    }

    /**
     * Pause core graph updates. While paused, incoming state from updateState()
     * is saved to lastAppState but processGraphData() is deferred.
     * The render loop continues with whatever graphData was last set.
     */
    private pauseCoreGraphUpdates(): void {
        if (!this._coreGraphPaused) {
            console.log('[CoreGraph] paused');
            this._coreGraphPaused = true;
        }
    }

    /**
     * Unpause and flush: reprocesses graph with latest appState and current filters.
     */
    private unpauseCoreGraphUpdates(): void {
        if (this._coreGraphPaused) {
            this._coreGraphPaused = false;
            if (this.lastAppState) {
                console.log(`[CoreGraph] unpaused, flushing (${Object.keys(this.lastAppState.tasks).length} tasks, filter=${this.currentFilter.includeRecursive?.length ?? 'none'})`);
                this.processGraphData(this.lastAppState);
            } else {
                console.log('[CoreGraph] unpaused, nothing to flush');
            }
        }
    }

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

        // Initialize from store
        const initialStoreState = useTodoStore.getState();
        this.currentFilter = initialStoreState.filter;

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

                // Read filter directly from store
                const filter = state.filter;
                const filterKey = JSON.stringify(filter);

                if (filterKey !== this.lastFilterKey) {
                    const prevFilter = this.currentFilter;
                    this.lastFilterKey = filterKey;
                    this.currentFilter = filter;
                    this.onFilterChange(prevFilter, filter);
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
            onInteractionEnd: () => {
                this.positionPersistence.scheduleLocalSave();
            },
        });
        this.inputHandler.setCallback((event) => this.interactionController.handleEvent(event));

        this.positionPersistence.setStateGetter(() => this.simulationState);
        useTodoStore.setState({
            savePositionsCallback: (viewId: string) => this.positionPersistence.savePositionsNow(viewId),
            loadPositionsCallback: (viewId: string) => {
                this.positionPersistence.fetchPositions(viewId).then(positions => {
                    if (positions) {
                        this.applyFetchedPositions(positions);
                        useTodoStore.getState().setLocalPositions(positions);
                    }
                });
            },
            saveLocalPositionsCallback: () => this.positionPersistence.saveLocalPositions(),
        });

        this.lastFrameTime = performance.now();
        this.startLoop();
    }

    updateState(appState: AppState): void {
        this.lastAppState = appState;

        if (!this._coreGraphPaused) {
            viewTrace('Graph', 'updateState:process', {
                taskCount: Object.keys(appState.tasks).length,
                depCount: Object.keys(appState.dependencies).length,
            });
            this.processGraphData(appState);
        } else {
            console.log(`[CoreGraph] updateState buffered (${Object.keys(appState.tasks).length} tasks held)`);
            viewTrace('Graph', 'updateState:buffered', {
                taskCount: Object.keys(appState.tasks).length,
            });
        }

        // Apply local positions synchronously on first update (no server fetch)
        if (!this.initialPositionsFetched) {
            this.initialPositionsFetched = true;
            const { localPositions } = useTodoStore.getState();
            this.unpauseCoreGraphUpdates();
            if (localPositions && Object.keys(localPositions).length > 0) {
                console.log(`[View] INIT applying ${Object.keys(localPositions).length} local positions`);
                this.applyFetchedPositions(localPositions);
            } else {
                console.log(`[View] INIT no local positions`);
            }
            this.setPositionState('ready');
        }
    }

    /**
     * Process app state into graph data. Positions are handled separately via REST.
     */
    private processGraphData(appState: AppState): void {
        viewTrace('Graph', 'processGraphData:start', {
            inputTasks: Object.keys(appState.tasks).length,
            inputDeps: Object.keys(appState.dependencies).length,
            filterInclude: this.currentFilter.includeRecursive?.length ?? 0,
            filterExclude: this.currentFilter.excludeRecursive?.length ?? 0,
            hideCompletedFor: this.currentFilter.hideCompletedFor,
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

        viewTrace('Graph', 'processGraphData:done', {
            outputTasks: Object.keys(graphData.tasks).length,
            outputDeps: Object.keys(graphData.dependencies).length,
        });
    }

    /**
     * Apply fetched positions to the simulation state if coverage is sufficient.
     */
    private applyFetchedPositions(positions: Record<string, { x: number; y: number }>): void {
        const currentNodeIds = this.graphData ? new Set(Object.keys(this.graphData.tasks)) : null;
        const fetchedCount = Object.keys(positions).length;

        if (currentNodeIds && currentNodeIds.size > 0) {
            // Filter out positions for nodes that no longer exist
            const validPositions: Record<string, { x: number; y: number }> = {};
            for (const [nodeId, pos] of Object.entries(positions)) {
                if (currentNodeIds.has(nodeId)) {
                    validPositions[nodeId] = pos;
                }
            }

            const validCount = Object.keys(validPositions).length;
            const coverageRatio = validCount / currentNodeIds.size;
            console.log(`[Pos] APPLY fetched=${fetchedCount} valid=${validCount} graphNodes=${currentNodeIds.size} coverage=${(coverageRatio * 100).toFixed(1)}%`);
            if (coverageRatio > 0.5 && validCount > 0) {
                console.log(`[Pos] APPLY accepted — setting simulationState`);
                this.simulationState = { positions: validPositions };
                // Force the engine to rebuild its layout from these positions
                this.simulationEngine.invalidateTopology?.();
            } else {
                console.log(`[Pos] APPLY rejected — coverage too low, keeping current simulation`);
            }
        } else {
            // No graph data yet, apply all positions
            console.log(`[Pos] APPLY no graphData yet, applying all ${fetchedCount} positions`);
            if (fetchedCount > 0) {
                this.simulationState = { positions };
            }
        }
    }

    /**
     * Apply client-side filter (includeRecursive), excludeRecursive, and hideCompletedFor.
     * Returns the input unchanged if no filters are active.
     */
    private applyFilter(taskList: NodeListOut): NodeListOut {
        const { includeRecursive, excludeRecursive, hideCompletedFor } = this.currentFilter;
        const hasInclude = includeRecursive && includeRecursive.length > 0;
        const hasExclude = excludeRecursive && excludeRecursive.length > 0;
        const hasHideCompleted = hideCompletedFor != null && hideCompletedFor > 0;

        if (!hasInclude && !hasExclude && !hasHideCompleted) {
            return taskList;
        }

        // Start with all nodes visible
        let visible = new Set<string>(Object.keys(taskList.tasks));

        // Apply includeRecursive: restrict to filter roots + recursive children
        if (hasInclude) {
            // Build parent → children adjacency from dependencies
            const childrenMap = new Map<string, string[]>();
            for (const dep of Object.values(taskList.dependencies)) {
                if (!childrenMap.has(dep.fromId)) childrenMap.set(dep.fromId, []);
                childrenMap.get(dep.fromId)!.push(dep.toId);
            }

            // BFS from filter roots
            visible = new Set<string>();
            const queue = [...includeRecursive!];
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

        // Apply excludeRecursive: remove hidden nodes
        if (hasExclude) {
            for (const nodeId of excludeRecursive!) {
                visible.delete(nodeId);
            }
        }

        // Apply hideCompletedFor: hide nodes whose calculatedValue became true
        // more than hideCompletedFor seconds ago
        if (hasHideCompleted) {
            const nowSec = Math.floor(Date.now() / 1000);
            const cutoff = nowSec - hideCompletedFor!;

            // Build dependency indexes for calculatedCompletedAt propagation
            const depsFwd: Record<string, string[]> = {};
            for (const dep of Object.values(taskList.dependencies)) {
                if (!taskList.tasks[dep.fromId] || !taskList.tasks[dep.toId]) continue;
                (depsFwd[dep.fromId] ??= []).push(dep.toId);
            }

            // Memoized calcTrueAt / calcFalseAt
            const trueAtCache: Record<string, number | null> = {};
            const falseAtCache: Record<string, number | null> = {};

            function calcTrueAt(nodeId: string): number | null {
                if (nodeId in trueAtCache) return trueAtCache[nodeId];
                const node = taskList.tasks[nodeId];
                if (!node) { trueAtCache[nodeId] = null; return null; }

                const completed = node.completed;
                const children = depsFwd[nodeId] ?? [];
                const nodeType = node.nodeType ?? 'Task';
                let result: number | null = null;

                if (nodeType === 'Task') {
                    // Task: trueAt = completed.modified if value===true, factoring deps
                    const ownTrueAt = (completed?.value === true) ? completed!.modified : null;
                    if (ownTrueAt != null) {
                        // Also need all deps to be true: trueAt = max(own, max children trueAt)
                        let maxChildTrue: number | null = null;
                        for (const cid of children) {
                            const ct = calcTrueAt(cid);
                            if (ct == null) { maxChildTrue = null; break; }
                            maxChildTrue = maxChildTrue == null ? ct : Math.max(maxChildTrue, ct);
                        }
                        if (children.length === 0 || maxChildTrue != null) {
                            result = maxChildTrue != null ? Math.max(ownTrueAt, maxChildTrue) : ownTrueAt;
                        }
                    }
                } else if (nodeType === 'And') {
                    // AND: true when all children true → max of children's trueAt
                    if (children.length === 0) { result = null; }
                    else {
                        let maxT: number | null = null;
                        for (const cid of children) {
                            const ct = calcTrueAt(cid);
                            if (ct == null) { maxT = null; break; }
                            maxT = maxT == null ? ct : Math.max(maxT, ct);
                        }
                        result = maxT;
                    }
                } else if (nodeType === 'Or') {
                    // OR: true when any child true → min of true-children's trueAt
                    let minT: number | null = null;
                    for (const cid of children) {
                        const ct = calcTrueAt(cid);
                        if (ct != null) {
                            minT = minT == null ? ct : Math.min(minT, ct);
                        }
                    }
                    result = minT;
                } else if (nodeType === 'Not') {
                    // NOT: true when child false → child's falseAt
                    result = children.length > 0 ? calcFalseAt(children[0]) : null;
                } else if (nodeType === 'ExactlyOne') {
                    // ExactlyOne: true when exactly one child true
                    const trueChildren = children.filter(cid => calcTrueAt(cid) != null);
                    if (trueChildren.length === 1) {
                        result = calcTrueAt(trueChildren[0]);
                    }
                }

                trueAtCache[nodeId] = result;
                return result;
            }

            function calcFalseAt(nodeId: string): number | null {
                if (nodeId in falseAtCache) return falseAtCache[nodeId];
                const node = taskList.tasks[nodeId];
                if (!node) { falseAtCache[nodeId] = null; return null; }

                const completed = node.completed;
                const children = depsFwd[nodeId] ?? [];
                const nodeType = node.nodeType ?? 'Task';
                let result: number | null = null;

                if (nodeType === 'Task') {
                    result = (completed?.value === false) ? completed!.modified : null;
                } else if (nodeType === 'And') {
                    // AND false when any child false → max of false-children's falseAt
                    let maxF: number | null = null;
                    for (const cid of children) {
                        const cf = calcFalseAt(cid);
                        if (cf != null) {
                            maxF = maxF == null ? cf : Math.max(maxF, cf);
                        }
                    }
                    result = maxF;
                } else if (nodeType === 'Or') {
                    // OR false when all children false → max of children's falseAt
                    if (children.length === 0) { result = null; }
                    else {
                        let maxF: number | null = null;
                        for (const cid of children) {
                            const cf = calcFalseAt(cid);
                            if (cf == null) { maxF = null; break; }
                            maxF = maxF == null ? cf : Math.max(maxF, cf);
                        }
                        result = maxF;
                    }
                } else if (nodeType === 'Not') {
                    // NOT false when child true → child's trueAt
                    result = children.length > 0 ? calcTrueAt(children[0]) : null;
                } else if (nodeType === 'ExactlyOne') {
                    // Simplified: false when 0 or >1 children true
                    const trueChildren = children.filter(cid => calcTrueAt(cid) != null);
                    if (trueChildren.length !== 1) {
                        // max of all children's falseAt
                        let maxF: number | null = null;
                        for (const cid of children) {
                            const cf = calcFalseAt(cid);
                            if (cf != null) {
                                maxF = maxF == null ? cf : Math.max(maxF, cf);
                            }
                        }
                        result = maxF;
                    }
                }

                falseAtCache[nodeId] = result;
                return result;
            }

            // Hide nodes where trueAt < cutoff
            for (const nodeId of [...visible]) {
                const trueAt = calcTrueAt(nodeId);
                if (trueAt != null && trueAt < cutoff) {
                    visible.delete(nodeId);
                }
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
     * Handle filter changes (from store).
     * Reprocesses graph and manages hideCompletedFor interval.
     */
    private onFilterChange(prevFilter: Filter, newFilter: Filter): void {
        viewTrace('Graph', 'filterChange', {
            prevInclude: prevFilter.includeRecursive?.length ?? 0,
            nextInclude: newFilter.includeRecursive?.length ?? 0,
            prevExclude: prevFilter.excludeRecursive?.length ?? 0,
            nextExclude: newFilter.excludeRecursive?.length ?? 0,
            hideCompletedFor: newFilter.hideCompletedFor,
        });
        this.updatePersistencePause();
        this.updateHideCompletedInterval();

        if (this.lastAppState) {
            this.processGraphData(this.lastAppState);
        }
    }

    /**
     * Manage the setInterval for hideCompletedFor re-evaluation.
     */
    private updateHideCompletedInterval(): void {
        if (this.currentFilter.hideCompletedFor != null && this.currentFilter.hideCompletedFor > 0) {
            if (!this.hideCompletedIntervalId) {
                this.hideCompletedIntervalId = setInterval(() => {
                    if (this.lastAppState && !this._coreGraphPaused) {
                        this.processGraphData(this.lastAppState);
                    }
                }, 15000); // Re-evaluate every 15 seconds
            }
        } else {
            if (this.hideCompletedIntervalId) {
                clearInterval(this.hideCompletedIntervalId);
                this.hideCompletedIntervalId = null;
            }
        }
    }

    private updatePersistencePause(): void {
        const shouldPause = this.currentFilter.includeRecursive !== null;
        viewTrace('Graph', 'persistencePause', {
            shouldPause,
            filterCount: this.currentFilter.includeRecursive?.length ?? 0,
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
        if (this.hideCompletedIntervalId) {
            clearInterval(this.hideCompletedIntervalId);
            this.hideCompletedIntervalId = null;
        }
        this.positionPersistence.stop();
        useTodoStore.setState({ savePositionsCallback: null, loadPositionsCallback: null, saveLocalPositionsCallback: null });
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
