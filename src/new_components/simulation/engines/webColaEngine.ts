/**
 * WebCola Simulation Engine
 *
 * Adapts WebCola's constraint-based layout to the SimulationEngine interface.
 *
 * Key differences from ForceDirectedEngine:
 * - Stress minimization (not physics simulation) - converges to optimal layout
 * - Supports constraints (alignment, separation, groups)
 * - No deltaTime concept - each tick moves toward optimal regardless of timing
 */

import { LayoutAdaptor, Node as ColaInputNode, Link } from "webcola";
import {
    SimulationEngine,
    SimulatorInput,
    SimulationState,
    Position,
} from "../types";
import { NestedGraphData } from "../../../new_utils/nestGraphData";

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM LAYOUT WITH EXPOSED TICK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extends LayoutAdaptor to expose the protected tick() method.
 * This allows us to step the simulation manually each frame.
 */
class ManualTickLayout extends LayoutAdaptor {
    constructor() {
        super({
            // Empty kick - we'll tick manually
            kick: () => {},
            // Empty trigger - we don't need events
            trigger: () => {},
        });
    }

    /**
     * Expose tick() for manual stepping.
     * Returns true when converged.
     */
    public doTick(): boolean {
        return this.tick();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRAINT TYPES (high-level, using string IDs)
// ═══════════════════════════════════════════════════════════════════════════

/** Separation constraint: leftId must be left/above rightId by at least gap */
export interface SeparationConstraint {
    type: "separation";
    axis: "x" | "y";
    leftId: string;
    rightId: string;
    gap: number;
    equality?: boolean; // exact distance vs minimum
}

/** Alignment constraint: all nodes share same x or y coordinate */
export interface AlignmentConstraint {
    type: "alignment";
    axis: "x" | "y";
    nodeIds: string[];
    offsets?: number[]; // optional offset for each node
}

export type Constraint = SeparationConstraint | AlignmentConstraint;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface WebColaConfig {
    /** Ideal edge length. Default: 150 */
    linkDistance?: number;
    /** Prevent node overlap (requires width/height on nodes). Default: false */
    avoidOverlaps?: boolean;
    /** Flow direction for directed graphs. Default: undefined (no flow) */
    flowDirection?: "x" | "y";
    /** Minimum separation for flow constraints. Default: 50 */
    flowSeparation?: number;
    /** Use symmetric diff for adaptive link lengths. Default: false */
    symmetricDiffLinkLengths?: boolean;
    /** Convergence threshold. Default: 0.01 */
    convergenceThreshold?: number;
    /** High-level constraints using string IDs. Default: [] */
    constraints?: Constraint[];
    /** Add virtual root node connecting all parentless nodes (layout-only). Default: true */
    virtualRoot?: boolean;
    /** Group disconnected components with bounding box separation. Default: false */
    componentGrouping?: boolean;
    /** Padding between component groups (when componentGrouping is true). Default: 100 */
    componentPadding?: number;
}

const DEFAULT_CONFIG: Required<WebColaConfig> = {
    linkDistance: 150,
    avoidOverlaps: false,
    flowDirection: undefined as unknown as "x" | "y",
    flowSeparation: 50,
    symmetricDiffLinkLengths: false,
    convergenceThreshold: 0.01,
    constraints: [],
    virtualRoot: true,
    componentGrouping: true,
    componentPadding: 20,
};

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Internal node representation for WebCola */
interface ColaNode extends ColaInputNode {
    id: string; // Our string ID, kept for reverse mapping
    x: number;
    y: number;
    componentId?: number; // Connected component ID (if available)
}

/** Internal link representation for WebCola */
interface ColaLink extends Link<ColaNode> {
    id: string; // Edge ID for change detection
}

/** Snapshot of graph topology for change detection */
interface TopologySnapshot {
    nodeIds: string;  // Sorted, joined node IDs
    edgeIds: string;  // Sorted, joined edge IDs
}

/** ID for the virtual root node (layout-only, not rendered) */
const VIRTUAL_ROOT_ID = "__virtual_root__";

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WebCola-based simulation engine implementing the SimulationEngine interface.
 *
 * Uses stress minimization (not physics) to find optimal node positions.
 * Supports constraints like flow direction, alignment, and separation.
 */
export class WebColaEngine implements SimulationEngine {
    private config: Required<WebColaConfig>;
    private layout: ManualTickLayout | null = null;

    // Internal graph representation
    private colaNodes: ColaNode[] = [];
    private colaLinks: ColaLink[] = [];

    // Mappings for O(1) lookup
    private nodeIdToIndex: Map<string, number> = new Map();

    // Topology snapshot for change detection
    private lastTopology: TopologySnapshot = { nodeIds: "", edgeIds: "" };

    // Track if we've done initial layout
    private initialized = false;

    constructor(config: WebColaConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Advance simulation by one step. Detects topology changes and reconciles
     * internal WebCola state. Ignores deltaTime (stress minimization is time-independent).
     */
    step(input: SimulatorInput, prevState: SimulationState): SimulationState {
        const { graph } = input;
        // Note: deltaTime is intentionally ignored - WebCola uses stress minimization

        // Compute current topology snapshot
        const currentTopology = this.computeTopologySnapshot(graph);
        const topologyChanged = !this.topologyEquals(currentTopology, this.lastTopology);

        if (topologyChanged || !this.initialized) {
            // Topology changed - full reconciliation
            this.reconcileGraph(graph, prevState);
            this.lastTopology = currentTopology;
            this.initialized = true;
        } else {
            // Topology unchanged - just sync any external position changes
            this.syncPositionsFromState(prevState);
        }

        // Always tick - this animates smoothly from current positions toward optimal
        if (this.layout) {
            this.layout.doTick();
        }

        return this.extractState();
    }

    /** Clean up WebCola layout and reset internal state. */
    destroy(): void {
        if (this.layout) {
            this.layout.stop();
        }
        this.layout = null;
        this.colaNodes = [];
        this.colaLinks = [];
        this.nodeIdToIndex.clear();
        this.lastTopology = { nodeIds: "", edgeIds: "" };
        this.initialized = false;
    }

    // ───────────────────────────────────────────────────────────────────────
    // TOPOLOGY CHANGE DETECTION
    // ───────────────────────────────────────────────────────────────────────

    /** Create a string snapshot of node/edge IDs for cheap equality comparison. */
    private computeTopologySnapshot(graph: NestedGraphData): TopologySnapshot {
        const nodeIds = Object.keys(graph.tasks).sort().join(",");
        const edgeIds = Object.keys(graph.dependencies).sort().join(",");
        return { nodeIds, edgeIds };
    }

    /** Compare two topology snapshots for equality. */
    private topologyEquals(a: TopologySnapshot, b: TopologySnapshot): boolean {
        return a.nodeIds === b.nodeIds && a.edgeIds === b.edgeIds;
    }

    // ───────────────────────────────────────────────────────────────────────
    // GRAPH RECONCILIATION
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Rebuild internal cola node/link arrays from the incoming graph.
     * Preserves positions from prevState where available, else from existing
     * cola nodes, else random Gaussian initialization.
     */
    private reconcileGraph(graph: NestedGraphData, prevState: SimulationState): void {
        const { tasks, dependencies } = graph;

        // Build new node array
        const newNodes: ColaNode[] = [];
        const newNodeIdToIndex = new Map<string, number>();

        for (const [taskId, taskWrapper] of Object.entries(tasks)) {
            const index = newNodes.length;
            const prevPos = prevState.positions[taskId];

            // Try to get position from: prevState > existing cola node > random
            let x: number, y: number;
            if (prevPos) {
                x = prevPos.x;
                y = prevPos.y;
            } else {
                const existingIndex = this.nodeIdToIndex.get(taskId);
                if (existingIndex !== undefined && this.colaNodes[existingIndex]) {
                    x = this.colaNodes[existingIndex].x;
                    y = this.colaNodes[existingIndex].y;
                } else {
                    // Random initialization (Gaussian around origin)
                    x = this.gaussianRandom() * 100;
                    y = this.gaussianRandom() * 100;
                }
            }

            // Extract componentId if present (from computeConnectedComponents)
            const componentId = (taskWrapper as { componentId?: number }).componentId;

            const node: ColaNode = {
                id: taskId,
                index,
                x,
                y,
                width: 60,  // Default size for avoidOverlaps
                height: 40,
                componentId,
            };

            newNodes.push(node);
            newNodeIdToIndex.set(taskId, index);
        }

        // Build new link array
        const newLinks: ColaLink[] = [];
        for (const [depId, dep] of Object.entries(dependencies)) {
            const sourceIndex = newNodeIdToIndex.get(dep.data.fromId);
            const targetIndex = newNodeIdToIndex.get(dep.data.toId);

            // Skip links with missing endpoints
            if (sourceIndex === undefined || targetIndex === undefined) {
                continue;
            }

            newLinks.push({
                id: depId,
                source: newNodes[sourceIndex],
                target: newNodes[targetIndex],
            });
        }

        // Find nodes with no parents (no incoming edges) - these are "root" nodes
        const nodesWithParents = new Set<string>();
        for (const dep of Object.values(dependencies)) {
            nodesWithParents.add(dep.data.toId);
        }
        const rootNodeIds = Object.keys(tasks).filter(id => !nodesWithParents.has(id));

        // Add virtual root node if enabled and multiple root nodes exist
        if (this.config.virtualRoot && rootNodeIds.length > 1) {
            const virtualIndex = newNodes.length;
            const virtualRoot: ColaNode = {
                id: VIRTUAL_ROOT_ID,
                index: virtualIndex,
                x: 0,
                y: -200, // Position above the tree
                width: 1,
                height: 1,
            };
            newNodes.push(virtualRoot);
            newNodeIdToIndex.set(VIRTUAL_ROOT_ID, virtualIndex);

            // Connect virtual root to all parentless nodes
            for (const rootId of rootNodeIds) {
                const targetIndex = newNodeIdToIndex.get(rootId)!;
                newLinks.push({
                    id: `__virtual_link_${rootId}__`,
                    source: virtualRoot,
                    target: newNodes[targetIndex],
                });
            }
        }

        // Update internal state
        this.colaNodes = newNodes;
        this.colaLinks = newLinks;
        this.nodeIdToIndex = newNodeIdToIndex;

        // Recreate layout
        this.rebuildLayout();
    }

    /**
     * Create a new ManualTickLayout with current config and node/link arrays.
     * Initializes distance matrix via start() but runs zero iterations,
     * allowing smooth animated convergence through subsequent doTick() calls.
     */
    private rebuildLayout(): void {
        const {
            linkDistance,
            avoidOverlaps,
            flowDirection,
            flowSeparation,
            symmetricDiffLinkLengths,
            convergenceThreshold,
            constraints,
        } = this.config;

        // Create new layout
        this.layout = new ManualTickLayout();
        this.layout
            .nodes(this.colaNodes)
            .links(this.colaLinks)
            .linkDistance(linkDistance)
            .convergenceThreshold(convergenceThreshold)
            .handleDisconnected(true);

        // Auto-create groups from connected components (if componentId present)
        const componentGroups = this.buildComponentGroups();
        if (componentGroups) {
            // WebCola accepts indices in leaves[], converts to nodes internally
            // Type assertion needed because @types/webcola expects Node[]
            this.layout.groups(componentGroups as any);
            this.layout.avoidOverlaps(true); // Required for group separation
        } else {
            this.layout.avoidOverlaps(avoidOverlaps);
        }

        // Optional: flow direction for directed graphs
        if (flowDirection) {
            this.layout.flowLayout(flowDirection, flowSeparation);
        }

        // Optional: adaptive link lengths based on graph structure
        if (symmetricDiffLinkLengths) {
            this.layout.symmetricDiffLinkLengths(linkDistance / 10);
        }

        // Translate high-level constraints to WebCola format
        if (constraints.length > 0) {
            const colaConstraints = this.translateConstraints(constraints);
            this.layout.constraints(colaConstraints);
        }

        // Initialize layout WITHOUT running iterations
        // This sets up distance matrix and Descent, but doesn't move nodes
        // Animation happens naturally through doTick() calls
        this.layout.start(
            0,     // No unconstrained iterations
            0,     // No user constraint iterations
            0,     // No all-constraint iterations
            0,     // No grid snap iterations
            false, // keepRunning = false
            false  // centerGraph = false (preserve positions from prevState)
        );

        // IMPORTANT: resume() sets alpha to 0.1, which allows tick() to run
        // Without this, alpha is 0 and tick() immediately returns "converged"
        this.layout.resume();
    }

    // ───────────────────────────────────────────────────────────────────────
    // COMPONENT GROUPS
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Build WebCola groups from connected components.
     * Returns null if disabled, nodes don't have componentId, or only one component exists.
     */
    private buildComponentGroups(): Array<{ leaves: number[]; padding: number }> | null {
        if (!this.config.componentGrouping) return null;
        if (this.colaNodes.length === 0) return null;

        // Check if any real node has componentId
        const realNodes = this.colaNodes.filter(n => n.id !== VIRTUAL_ROOT_ID);
        if (realNodes.length === 0 || realNodes[0].componentId === undefined) return null;

        // Group node indices by componentId (exclude virtual root)
        const componentMap = new Map<number, number[]>();
        for (const node of realNodes) {
            const cid = node.componentId!;
            if (!componentMap.has(cid)) {
                componentMap.set(cid, []);
            }
            componentMap.get(cid)!.push(node.index!);
        }

        // Only create groups if multiple components exist
        if (componentMap.size <= 1) return null;

        // Create a group for each component
        return Array.from(componentMap.values()).map(indices => ({
            leaves: indices,
            padding: this.config.componentPadding,
        }));
    }

    // ───────────────────────────────────────────────────────────────────────
    // CONSTRAINT TRANSLATION
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Convert high-level constraints (using string IDs) to WebCola format (using indices).
     * Silently skips constraints referencing non-existent nodes.
     */
    private translateConstraints(constraints: Constraint[]): any[] {
        const colaConstraints: any[] = [];

        for (const c of constraints) {
            if (c.type === "separation") {
                const leftIndex = this.nodeIdToIndex.get(c.leftId);
                const rightIndex = this.nodeIdToIndex.get(c.rightId);

                if (leftIndex !== undefined && rightIndex !== undefined) {
                    colaConstraints.push({
                        axis: c.axis,
                        left: leftIndex,
                        right: rightIndex,
                        gap: c.gap,
                        equality: c.equality ?? false,
                    });
                }
            } else if (c.type === "alignment") {
                const offsets: { node: number; offset: number }[] = [];

                for (let i = 0; i < c.nodeIds.length; i++) {
                    const nodeIndex = this.nodeIdToIndex.get(c.nodeIds[i]);
                    if (nodeIndex !== undefined) {
                        offsets.push({
                            node: nodeIndex,
                            offset: c.offsets?.[i] ?? 0,
                        });
                    }
                }

                if (offsets.length >= 2) {
                    colaConstraints.push({
                        type: "alignment",
                        axis: c.axis,
                        offsets,
                    });
                }
            }
        }

        return colaConstraints;
    }

    // ───────────────────────────────────────────────────────────────────────
    // POSITION SYNC
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Sync positions from external state into cola nodes.
     * This handles the case where positions were modified externally
     * (e.g., user dragging a node).
     */
    private syncPositionsFromState(prevState: SimulationState): void {
        for (const [taskId, pos] of Object.entries(prevState.positions)) {
            const index = this.nodeIdToIndex.get(taskId);
            if (index !== undefined && this.colaNodes[index]) {
                const node = this.colaNodes[index];
                // Only update if position actually changed (avoid unnecessary perturbation)
                if (Math.abs(node.x - pos.x) > 0.01 || Math.abs(node.y - pos.y) > 0.01) {
                    node.x = pos.x;
                    node.y = pos.y;
                }
            }
        }
    }

    /**
     * Extract current positions from cola nodes into SimulationState.
     * Excludes virtual nodes (layout-only, not for rendering).
     */
    private extractState(): SimulationState {
        const positions: Record<string, Position> = {};

        for (const node of this.colaNodes) {
            // Skip virtual root - it's only for layout
            if (node.id === VIRTUAL_ROOT_ID) continue;

            positions[node.id] = {
                x: node.x,
                y: node.y,
            };
        }

        return { positions };
    }

    // ───────────────────────────────────────────────────────────────────────
    // UTILITIES
    // ───────────────────────────────────────────────────────────────────────

    /** Box-Muller transform for Gaussian random */
    private gaussianRandom(): number {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
}
