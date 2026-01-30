import React, { useEffect, useRef, useState } from "react";
import { GraphData } from "@/types/GraphData";
import { PhysicsSimulator } from "@/physics/PhysicsSimulator";
import { GraphVisualizer, ViewTransform } from "@/view/GraphVisualizer";
import { GraphNavigator } from "@/view/GraphNavigator";
import { AutoFocusNavigator } from "@/view/AutoFocusNavigator";
import { INavigator } from "@/view/INavigator";
import { CommandPalette } from "./CommandPalette";
import { addCursorStyle } from "@/common/addCursorStyle";
import { addStateStyles } from "./addNodeStateStyles";
import { NodeInfoOverlay } from "./NodeInfoOverlay";
import { getModuleNode, hasModuleNode } from "@/common/dict_graph/api/functional_dict_graph_module_api";

interface GraphViewerProps {
    graphData: GraphData;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({ graphData }) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const rootContainerRef = useRef<HTMLDivElement>(null);
    const physicsSimulatorRef = useRef<PhysicsSimulator | null>(null);
    const visualizerRef = useRef<GraphVisualizer | null>(null);
    const navigatorRef = useRef<INavigator | null>(null);
    
    const [cursorNode, setCursorNode] = useState<string | null>(null);
    const cursorNodeRef = useRef<string | null>(null);
    const [navigatorMode, setNavigatorMode] = useState<'manual' | 'auto'>('manual');
    const navigatorModeRef = useRef<'manual' | 'auto'>('manual');
    const draggedNodeRef = useRef<string | null>(null);
    
    // Keep refs in sync with state
    useEffect(() => {
        cursorNodeRef.current = cursorNode;
    }, [cursorNode]);
    
    useEffect(() => {
        navigatorModeRef.current = navigatorMode;
    }, [navigatorMode]);

    useEffect(() => {
        if (!viewportRef.current) return;

        // Create physics simulator
        const physicsSimulator = new PhysicsSimulator((state) => {
            // Update visualizer when physics state changes
            if (visualizerRef.current) {
                let styledGraph = addStateStyles(graphData);
                styledGraph = addCursorStyle(styledGraph, cursorNodeRef.current ? [cursorNodeRef.current] : []);
                visualizerRef.current.updateState(styledGraph, state);
            }
        });
        physicsSimulatorRef.current = physicsSimulator;

        // Initialize transform
        const initialTransform: ViewTransform = {
            a: 100, // Initial scale: 100 pixels per world unit
            b: 0,
            c: 0,
            d: 100,
            tx: viewportRef.current.clientWidth / 2,
            ty: viewportRef.current.clientHeight / 2
        };

        // Create visualizer with node interaction callbacks only
        const visualizer = new GraphVisualizer(
            viewportRef.current,
            initialTransform,
            {
                onNodeDrag: (nodeId, newPosition) => {
                    // Prevent dragging in auto mode
                    if (navigatorModeRef.current === 'auto') return;
                    
                    // Track that this node is being dragged
                    draggedNodeRef.current = nodeId;
                    
                    // On node drag - stop simulation for this node
                    physicsSimulator.nodesToSkipSimulation.add(nodeId);
                    physicsSimulator.setSpatialData(nodeId, { position: [newPosition.x, newPosition.y] });
                    physicsSimulator.registerInteraction();
                },
                onNodeDrop: (nodeId) => {
                    // Prevent drop handling in auto mode
                    if (navigatorModeRef.current === 'auto') return;
                    
                    // Clear drag tracking
                    draggedNodeRef.current = null;
                    
                    // On node drop - resume simulation
                    physicsSimulator.nodesToSkipSimulation.delete(nodeId);
                    physicsSimulator.registerInteraction();
                },
                onNodeClick: (nodeId) => {
                    // On node click
                    setCursorNode(nodeId);
                }
            }
        );
        visualizerRef.current = visualizer;

        // Create and attach navigator (no callbacks needed at construction)
        const navigator = new GraphNavigator(
            100, // Initial scale
            { width: viewportRef.current.clientWidth, height: viewportRef.current.clientHeight }
        );
        navigatorRef.current = navigator;
        
        // Attach navigator to visualizer (visualizer will set the callback)
        visualizer.setNavigator(navigator);

        // Expose to window for debugging
        (window as any).physicsSimulator = physicsSimulator;
        (window as any).visualizer = visualizer;
        (window as any).graphNavigator = navigator;

        // Initialize with graph data
        physicsSimulator.setGraphData(graphData);

        return () => {
            if (navigatorRef.current) {
                navigatorRef.current.destroy();
            }
            physicsSimulator.destroy();
            visualizer.destroy();
        };
    }, []);

    // Handle window resize - update navigator size
    useEffect(() => {
        const handleResize = () => {
            if (viewportRef.current && navigatorRef.current) {
                navigatorRef.current.updateSize(
                    viewportRef.current.clientWidth,
                    viewportRef.current.clientHeight
                );
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Handle navigator mode switching
    useEffect(() => {
        if (!visualizerRef.current || !viewportRef.current || !physicsSimulatorRef.current) return;

        const visualizer = visualizerRef.current;
        const physicsSimulator = physicsSimulatorRef.current;
        const svgSize = { 
            width: viewportRef.current.clientWidth, 
            height: viewportRef.current.clientHeight 
        };

        // Cancel any active drag when switching to auto mode
        if (navigatorMode === 'auto' && draggedNodeRef.current) {
            const draggedNode = draggedNodeRef.current;
            // Resume physics simulation for the dragged node
            physicsSimulator.nodesToSkipSimulation.delete(draggedNode);
            physicsSimulator.registerInteraction();
            // Clear drag state
            draggedNodeRef.current = null;
        }

        if (navigatorMode === 'manual') {
            // Switch to manual navigator
            const manualNav = new GraphNavigator(100, svgSize);
            
            // Copy current transform if switching from another navigator
            if (navigatorRef.current) {
                manualNav.setTransform(navigatorRef.current.getTransform());
            }
            
            navigatorRef.current = manualNav;
            visualizer.setNavigator(manualNav);
            
            // Expose to window for debugging
            (window as any).graphNavigator = manualNav;
        } else {
            // Switch to auto-focus navigator
            const currentTransform = navigatorRef.current?.getTransform() || visualizer.transform;
            const autoNav = new AutoFocusNavigator(currentTransform, svgSize);
            
            navigatorRef.current = autoNav;
            visualizer.setNavigator(autoNav);
            
            // Expose to window for debugging
            (window as any).graphNavigator = autoNav;
        }
    }, [navigatorMode]);

    // Continuously track node position in auto mode
    useEffect(() => {
        if (navigatorMode === 'auto' && cursorNode && navigatorRef.current instanceof AutoFocusNavigator && physicsSimulatorRef.current) {
            let animationFrameId: number | null = null;
            
            const trackNode = () => {
                if (!physicsSimulatorRef.current || !navigatorRef.current) {
                    return;
                }
                
                // Type guard: only proceed if navigator is AutoFocusNavigator
                const navigator = navigatorRef.current;
                if (!(navigator instanceof AutoFocusNavigator)) {
                    return;
                }
                
                const state = physicsSimulatorRef.current.getState();
                if (hasModuleNode(state.spatialModule, cursorNode)) {
                    const spatial = getModuleNode(state.spatialModule, cursorNode);
                    
                    if (spatial.position) {
                        // Calculate the "up" direction based on connected edges
                        let upX = 0;
                        let upY = 0;
                        let connectedCount = 0;
                        
                        // Iterate through all edges to find connected nodes
                        for (const edge of graphData.edges) {
                            if (edge.source === cursorNode || edge.target === cursorNode) {
                                const otherNodeId = edge.source === cursorNode ? edge.target : edge.source;
                                
                                if (hasModuleNode(state.spatialModule, otherNodeId)) {
                                    const otherSpatial = getModuleNode(state.spatialModule, otherNodeId);
                                    
                                    // Calculate direction vector from current node to other node
                                    const dx = otherSpatial.position[0] - spatial.position[0];
                                    const dy = otherSpatial.position[1] - spatial.position[1];
                                    
                                    // If this node is the target (receiving edge), flip the direction
                                    if (edge.target === cursorNode) {
                                        upX -= dx;
                                        upY -= dy;
                                    } else {
                                        // If this node is the source (outgoing edge), use direction as-is
                                        upX += dx;
                                        upY += dy;
                                    }
                                    
                                    connectedCount++;
                                }
                            }
                        }
                        
                        // Normalize the up vector if we found connected nodes
                        let upVector: [number, number] | undefined = undefined;
                        if (connectedCount > 0) {
                            const magnitude = Math.sqrt(upX * upX + upY * upY);
                            if (magnitude > 0.001) { // Avoid division by zero
                                upVector = [upX / magnitude, upY / magnitude];
                            }
                        }
                        
                        navigator.focusOn(spatial.position[0], spatial.position[1], 150, upVector);
                    }
                }
                
                animationFrameId = requestAnimationFrame(trackNode);
            };
            
            // Start tracking
            trackNode();
            
            return () => {
                if (animationFrameId !== null) {
                    cancelAnimationFrame(animationFrameId);
                }
            };
        }
    }, [cursorNode, navigatorMode]);

    // Handle Escape key to clear cursor
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setCursorNode(null);
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Update graph data when it changes or cursor changes
    useEffect(() => {
        if (physicsSimulatorRef.current && visualizerRef.current) {
            physicsSimulatorRef.current.setGraphData(graphData);
            // Apply all styles in order: state styles first, then cursor
            let styledGraph = addStateStyles(graphData);
            styledGraph = addCursorStyle(styledGraph, cursorNode ? [cursorNode] : []);
            visualizerRef.current.updateState(styledGraph, physicsSimulatorRef.current.getState());
        }
    }, [graphData, cursorNode]);

    const handleCommandRun = (command: string) => {
        if (command.toLowerCase() === 'help') {
            return 'Available commands:\n  help - Show this help message\n\nTo set graph data from console:\nwindow.setGraphData({\n  nodes: [{id: "a"}, {id: "b"}],\n  edges: [{source: "a", target: "b", weight: 1}]\n})';
        }
        return 'Unknown command. Type "help" for available commands.';
    };

    return (
        <div style={{ position: "absolute", width: "100%", height: "100%" }}>
            <div style={{ width: "100%", height: "100%", backgroundColor: "black", position: "absolute" }} ref={rootContainerRef}>
                <div ref={viewportRef} style={{ width: "100%", height: "100%", backgroundColor: "black", position: "absolute" }} />
                <CommandPalette onCommandRun={handleCommandRun} />
                <NodeInfoOverlay 
                    node={cursorNode ? graphData.nodes.find(n => n.id === cursorNode) || null : null}
                    onClose={() => setCursorNode(null)}
                />
                {/* Navigator Mode Selector */}
                <div style={{
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    zIndex: 1000
                }}>
                    <select
                        value={navigatorMode}
                        onChange={(e) => setNavigatorMode(e.target.value as 'manual' | 'auto')}
                        style={{
                            padding: "8px 12px",
                            fontSize: "14px",
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            color: "white",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            borderRadius: "4px",
                            cursor: "pointer",
                            outline: "none"
                        }}
                    >
                        <option value="manual">Manual Navigation</option>
                        <option value="auto">Auto Focus</option>
                    </select>
                </div>
            </div>
        </div>
    );
};
