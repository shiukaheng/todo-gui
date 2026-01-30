import { GraphData } from "@/types/GraphData";
import { SpatialNode } from "@/common/app_types/nodeTypes";
import { DictGraphModule } from "@/common/dict_graph/DictGraphModule";
import { 
    cloneModule, 
    createModule, 
    deleteModuleNode, 
    getModuleNode, 
    hasModuleNode, 
    listModuleNodes, 
    mutateModuleAllNodes, 
    setModuleNode 
} from "@/common/dict_graph/api/functional_dict_graph_module_api";
import { SimulationParameters, getDefaultSimulationParameters } from "@/common/graph_physics/types";
import { vectorDifference, magnitude, vectorScalarMultiply, vectorSum } from "@/common/vector/utils";
import { Vector } from "@/common/vector/vector";

export interface PhysicsState {
    spatialModule: DictGraphModule<SpatialNode>;
}

function unitGaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export class PhysicsSimulator {
    private graphData: GraphData = { nodes: [], edges: [] };
    private spatialModule: DictGraphModule<SpatialNode> = createModule();
    
    public simulationParameters: SimulationParameters = getDefaultSimulationParameters();
    public nodesToSkipSimulation: Set<string> = new Set();
    
    private animationFrameId: number | null = null;
    private stateChangeCallback: ((state: PhysicsState) => void) | null = null;

    constructor(onStateChange?: (state: PhysicsState) => void) {
        this.stateChangeCallback = onStateChange || null;
        this.startAnimationLoop();
    }

    public setGraphData(graphData: GraphData, initialPositions?: DictGraphModule<SpatialNode>): void {
        this.graphData = graphData;
        
        if (initialPositions) {
            this.spatialModule = cloneModule(initialPositions);
        }
        
        this.rectifySpatialModule();
    }

    public registerInteraction(): void {
        // Kept for API compatibility
    }

    public getState(): PhysicsState {
        return {
            spatialModule: this.spatialModule
        };
    }

    public destroy(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    public setSpatialData(nodeId: string, data: SpatialNode): void {
        setModuleNode(this.spatialModule, nodeId, data);
    }

    public getSpatialData(nodeId: string): SpatialNode | undefined {
        return hasModuleNode(this.spatialModule, nodeId) 
            ? getModuleNode(this.spatialModule, nodeId) 
            : undefined;
    }

    private rectifySpatialModule(): void {
        const nodeIds = new Set(this.graphData.nodes.map(n => n.id));

        // Add missing nodes with random positions
        for (const node of this.graphData.nodes) {
            if (!hasModuleNode(this.spatialModule, node.id)) {
                const sigma = this.simulationParameters.spawnSigma;
                const position: Vector = [sigma * unitGaussianRandom(), sigma * unitGaussianRandom()];
                console.log('[PhysicsSimulator] Adding new node:', node.id, 'at position:', position);
                setModuleNode(this.spatialModule, node.id, { position });
            }
        }
        
        // Remove nodes that are no longer in graph
        for (const node of listModuleNodes(this.spatialModule)) {
            if (!nodeIds.has(node.id)) {
                deleteModuleNode(this.spatialModule, node.id);
            }
        }
    }

    private startAnimationLoop(): void {
        const loop = () => {
            this.updateSimulation();
            this.animationFrameId = requestAnimationFrame(loop);
        };
        this.animationFrameId = requestAnimationFrame(loop);
    }

    private updateSimulation(): void {
        // Skip simulation if there's no graph data
        if (this.graphData.nodes.length === 0) {
            return;
        }
        
        this.applyForces();
        
        if (this.stateChangeCallback) {
            this.stateChangeCallback(this.getState());
        }
    }

    private applyForces(): void {
        const params = this.simulationParameters;
        const forces: { [nodeId: string]: Vector } = {};
        
        // Initialize forces to zero
        for (const node of this.graphData.nodes) {
            forces[node.id] = [0, 0];
        }
        
        // Repulsion forces (n² all pairs)
        for (let i = 0; i < this.graphData.nodes.length; i++) {
            const node1 = this.graphData.nodes[i];
            const pos1 = getModuleNode(this.spatialModule, node1.id).position;
            
            for (let j = i + 1; j < this.graphData.nodes.length; j++) {
                const node2 = this.graphData.nodes[j];
                const pos2 = getModuleNode(this.spatialModule, node2.id).position;
                
                const diff = vectorDifference(pos1, pos2);
                const distance = magnitude(diff);
                
                if (distance < 0.01) continue;
                
                const repulsionForce = params.repulsionStrength / (distance * distance);
                const force = vectorScalarMultiply(diff, repulsionForce / distance);
                
                forces[node1.id] = vectorSum(forces[node1.id], force);
                forces[node2.id] = vectorSum(forces[node2.id], vectorScalarMultiply(force, -1));
            }
        }
        
        // Tension forces from edges (spring-like with desired edge length)
        for (const edge of this.graphData.edges) {
            // Skip edges where source or target doesn't exist in spatial module
            if (!hasModuleNode(this.spatialModule, edge.source) || !hasModuleNode(this.spatialModule, edge.target)) {
                continue;
            }
            
            const sourcePos = getModuleNode(this.spatialModule, edge.source).position;
            const targetPos = getModuleNode(this.spatialModule, edge.target).position;
            const diff = vectorDifference(targetPos, sourcePos);
            const distance = magnitude(diff);
            
            if (distance < 0.01) continue;
            
            // Spring force: proportional to (distance - desiredEdgeLength)
            // If distance > desired: attract (positive force)
            // If distance < desired: repel (negative force)
            const displacement = distance - params.desiredEdgeLength;
            const tensionForce = params.tensionStrength * displacement;
            const force = vectorScalarMultiply(diff, tensionForce / distance);
            const weight = edge.data.weight ?? 1; // Use weight from data if available, default to 1
            
            forces[edge.source] = vectorSum(forces[edge.source], vectorScalarMultiply(force, weight));
            forces[edge.target] = vectorSum(forces[edge.target], vectorScalarMultiply(force, -weight));
        }
        
        // Apply forces to positions with friction
        mutateModuleAllNodes(this.spatialModule, (id, spatialNode) => {
            if (this.nodesToSkipSimulation.has(id)) return spatialNode;
            
            const force = forces[id];
            const displacement = vectorScalarMultiply(force, params.stepSize);
            const dampedDisplacement = vectorScalarMultiply(displacement, params.friction);
            
            spatialNode.position = vectorSum(spatialNode.position, dampedDisplacement);
            return spatialNode;
        });
    }
}
