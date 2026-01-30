import React, { useEffect, useState, useCallback, useMemo } from "react";
import { KeyboardGraphNavigatorProps, SelectionOption } from "./types";
import { NodeSelectionModal } from "./NodeSelectionModal";
import { GraphNode } from "@/types/GraphData";
import { hasModuleNode, getModuleNode } from "@/common/dict_graph/api/functional_dict_graph_module_api";

type ModalContext = {
    type: 'parent' | 'child' | 'parent-for-peer';
    direction?: 'left' | 'right';
};

export const KeyboardGraphNavigator: React.FC<KeyboardGraphNavigatorProps> = ({
    graphData,
    cursorNode,
    setCursorNode,
    getPhysicsState,
    disabled = false,
}) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [modalOptions, setModalOptions] = useState<SelectionOption[]>([]);
    const [modalTitle, setModalTitle] = useState("");
    const [modalContext, setModalContext] = useState<ModalContext | null>(null);

    // Build a map of node ID to node for quick lookup
    const nodeMap = useMemo(() => {
        const map = new Map<string, GraphNode>();
        for (const node of graphData.nodes) {
            map.set(node.id, node);
        }
        return map;
    }, [graphData.nodes]);

    // Get display label for a node
    const getNodeLabel = useCallback((nodeId: string): string => {
        const node = nodeMap.get(nodeId);
        if (!node) return nodeId;
        const displayId = node.data.id ?? nodeId;
        // Extract name part after colon if present
        const parts = displayId.split(":");
        return parts.length >= 2 ? parts.slice(1).join(":") : displayId;
    }, [nodeMap]);

    // Filter to only include nodes that exist in the graph
    const filterValidNodes = useCallback((nodeIds: string[]): string[] => {
        return nodeIds.filter(id => nodeMap.has(id));
    }, [nodeMap]);

    // Get world position of a node
    const getWorldPosition = useCallback((nodeId: string): [number, number] | null => {
        const physicsState = getPhysicsState();
        if (!physicsState) return null;

        if (!hasModuleNode(physicsState.spatialModule, nodeId)) return null;

        const spatial = getModuleNode(physicsState.spatialModule, nodeId);
        const pos = spatial.position;
        return [pos[0], pos[1]];
    }, [getPhysicsState]);

    // Calculate angle from parent to child (in radians, -π to π)
    const getEdgeAngle = useCallback((parentId: string, childId: string): number | null => {
        const parentPos = getWorldPosition(parentId);
        const childPos = getWorldPosition(childId);
        if (!parentPos || !childPos) return null;

        const dx = childPos[0] - parentPos[0];
        const dy = childPos[1] - parentPos[1];
        return Math.atan2(dy, dx);
    }, [getWorldPosition]);

    // Navigate to parent (W key)
    const navigateToParent = useCallback(() => {
        if (!cursorNode) return;

        const currentNode = nodeMap.get(cursorNode);
        if (!currentNode) return;

        const parentIds = filterValidNodes(currentNode.data.parentIds || []);
        if (parentIds.length === 0) return;

        if (parentIds.length === 1) {
            setCursorNode(parentIds[0]);
        } else {
            // Show selection modal
            const options: SelectionOption[] = parentIds.map(id => ({
                nodeId: id,
                label: getNodeLabel(id),
            }));
            setModalOptions(options);
            setModalTitle("Select parent");
            setModalContext({ type: 'parent' });
            setModalOpen(true);
        }
    }, [cursorNode, nodeMap, filterValidNodes, setCursorNode, getNodeLabel]);

    // Navigate to child (S key)
    const navigateToChild = useCallback(() => {
        if (!cursorNode) return;

        const currentNode = nodeMap.get(cursorNode);
        if (!currentNode) return;

        const childIds = filterValidNodes(currentNode.data.childIds || []);
        if (childIds.length === 0) return;

        if (childIds.length === 1) {
            setCursorNode(childIds[0]);
        } else {
            // Show selection modal
            const options: SelectionOption[] = childIds.map(id => ({
                nodeId: id,
                label: getNodeLabel(id),
            }));
            setModalOptions(options);
            setModalTitle("Select child");
            setModalContext({ type: 'child' });
            setModalOpen(true);
        }
    }, [cursorNode, nodeMap, filterValidNodes, setCursorNode, getNodeLabel]);

    // Navigate to peer (A/D keys)
    const navigateToPeer = useCallback((direction: 'left' | 'right') => {
        if (!cursorNode) return;

        const currentNode = nodeMap.get(cursorNode);
        if (!currentNode) return;

        const parentIds = filterValidNodes(currentNode.data.parentIds || []);
        if (parentIds.length === 0) return;

        if (parentIds.length === 1) {
            // Single parent - find peers directly
            findAndNavigateToPeer(parentIds[0], direction);
        } else {
            // Multiple parents - show modal to select parent context first
            const options: SelectionOption[] = parentIds.map(id => ({
                nodeId: id,
                label: getNodeLabel(id),
            }));
            setModalOptions(options);
            setModalTitle("Select parent context");
            setModalContext({ type: 'parent-for-peer', direction });
            setModalOpen(true);
        }
    }, [cursorNode, nodeMap, filterValidNodes, getNodeLabel]);

    // Find and navigate to peer in the given direction relative to selected parent
    // Uses edge angles from parent: A = counter-clockwise, D = clockwise
    const findAndNavigateToPeer = useCallback((parentId: string, direction: 'left' | 'right') => {
        if (!cursorNode) return;

        const parentNode = nodeMap.get(parentId);
        if (!parentNode) return;

        // Get siblings (children of the parent, excluding current node)
        const siblingIds = filterValidNodes(parentNode.data.childIds || [])
            .filter(id => id !== cursorNode);

        if (siblingIds.length === 0) return;

        // Get current node's edge angle from parent
        const currentAngle = getEdgeAngle(parentId, cursorNode);
        if (currentAngle === null) return;

        // Calculate angle differences and find the nearest peer in the given direction
        let bestPeerId: string | null = null;
        let bestAngleDiff = Infinity;

        for (const peerId of siblingIds) {
            const peerAngle = getEdgeAngle(parentId, peerId);
            if (peerAngle === null) continue;

            // Calculate signed angle difference (positive = clockwise, negative = counter-clockwise)
            let angleDiff = peerAngle - currentAngle;

            // Normalize to [-π, π]
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            // For 'right' (D), we want clockwise (positive angle diff)
            // For 'left' (A), we want counter-clockwise (negative angle diff)
            if (direction === 'right' && angleDiff <= 0) continue;
            if (direction === 'left' && angleDiff >= 0) continue;

            const absAngleDiff = Math.abs(angleDiff);
            if (absAngleDiff < bestAngleDiff) {
                bestAngleDiff = absAngleDiff;
                bestPeerId = peerId;
            }
        }

        if (bestPeerId) {
            setCursorNode(bestPeerId);
        }
    }, [cursorNode, nodeMap, filterValidNodes, getEdgeAngle, setCursorNode]);

    // Handle modal selection
    const handleModalSelect = useCallback((nodeId: string) => {
        if (!modalContext) return;

        if (modalContext.type === 'parent' || modalContext.type === 'child') {
            setCursorNode(nodeId);
        } else if (modalContext.type === 'parent-for-peer' && modalContext.direction) {
            findAndNavigateToPeer(nodeId, modalContext.direction);
        }

        setModalOpen(false);
        setModalContext(null);
    }, [modalContext, setCursorNode, findAndNavigateToPeer]);

    // Handle modal close
    const handleModalClose = useCallback(() => {
        setModalOpen(false);
        setModalContext(null);
    }, []);

    // Keyboard event handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't handle if modal is open (modal handles its own keys)
        if (modalOpen) return;

        // Don't handle if disabled
        if (disabled) return;

        // Don't handle if no cursor
        if (!cursorNode) return;

        // Only handle WASD keys
        const key = e.key.toLowerCase();
        if (!['w', 'a', 's', 'd'].includes(key)) return;

        e.preventDefault();
        e.stopPropagation();

        switch (key) {
            case 'w':
                navigateToParent();
                break;
            case 's':
                navigateToChild();
                break;
            case 'a':
                navigateToPeer('left');
                break;
            case 'd':
                navigateToPeer('right');
                break;
        }
    }, [modalOpen, disabled, cursorNode, navigateToParent, navigateToChild, navigateToPeer]);

    // Attach keyboard listener
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Close modal if cursor node changes externally
    useEffect(() => {
        if (modalOpen) {
            setModalOpen(false);
            setModalContext(null);
        }
    }, [cursorNode]);

    // Don't render modal if not open
    if (!modalOpen) return null;

    return (
        <NodeSelectionModal
            options={modalOptions}
            onSelect={handleModalSelect}
            onClose={handleModalClose}
            title={modalTitle}
        />
    );
};
