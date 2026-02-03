/**
 * useGraphNavigationHandle - Hook that implements the navigation state machine
 *
 * Creates an imperative handle for keyboard-driven graph navigation with
 * disambiguation UI for multiple targets.
 */

import { useRef, useMemo, useEffect, useCallback } from "react";
import { CursorNeighbors } from "../GraphViewerEngineState";
import {
    NavState,
    NavDirection,
    NavTarget,
    NavDirectionMapping,
    GraphNavigationHandle,
    IDLE_STATE,
} from "./types";

export interface UseGraphNavigationHandleOptions {
    cursorNeighbors: CursorNeighbors;
    navDirectionMapping: NavDirectionMapping;
    selectors: string[];
    onCursorChange: (nodeId: string) => void;
    onNavStateChange: (state: NavState) => void;
}

function getPeerDirection(target: NavTarget): 'prev' | 'next' | null {
    if (target === 'prevPeer') return 'prev';
    if (target === 'nextPeer') return 'next';
    return null;
}

function getTargetType(target: NavTarget): 'parents' | 'children' | null {
    if (target === 'parents') return 'parents';
    if (target === 'children') return 'children';
    return null;
}

export function useGraphNavigationHandle(
    options: UseGraphNavigationHandleOptions
): GraphNavigationHandle {
    const {
        cursorNeighbors,
        navDirectionMapping,
        selectors,
        onCursorChange,
        onNavStateChange,
    } = options;

    // Store state in ref to avoid recreating handle on state changes
    const navStateRef = useRef<NavState>(IDLE_STATE);
    const pendingDirectionRef = useRef<NavDirection | null>(null);

    // Keep latest options in refs for stable handle
    const neighborsRef = useRef(cursorNeighbors);
    neighborsRef.current = cursorNeighbors;

    const mappingRef = useRef(navDirectionMapping);
    mappingRef.current = navDirectionMapping;

    const selectorsRef = useRef(selectors);
    selectorsRef.current = selectors;

    const onCursorChangeRef = useRef(onCursorChange);
    onCursorChangeRef.current = onCursorChange;

    const onNavStateChangeRef = useRef(onNavStateChange);
    onNavStateChangeRef.current = onNavStateChange;

    // Helper to update state and notify
    const setNavState = useCallback((newState: NavState) => {
        navStateRef.current = newState;
        onNavStateChangeRef.current(newState);
    }, []);

    // Reset to IDLE when cursorNeighbors changes
    useEffect(() => {
        setNavState(IDLE_STATE);
        pendingDirectionRef.current = null;
    }, [cursorNeighbors, setNavState]);

    // Get candidates for a target type
    const getCandidates = useCallback((target: NavTarget): string[] => {
        const neighbors = neighborsRef.current;
        const { topological } = neighbors;

        switch (target) {
            case 'parents':
                return topological.parents;
            case 'children':
                return topological.children;
            case 'prevPeer':
            case 'nextPeer': {
                // For peers, we need to know which parent context
                // If single parent, use that. Otherwise, return empty (needs parent selection first)
                const parentIds = Object.keys(topological.peers);
                if (parentIds.length === 1) {
                    const peerInfo = topological.peers[parentIds[0]];
                    const peer = target === 'prevPeer' ? peerInfo.prevPeer : peerInfo.nextPeer;
                    return peer ? [peer] : [];
                }
                return [];
            }
        }
    }, []);

    // Handle direction navigation
    const handleDirection = useCallback((direction: NavDirection) => {
        const currentState = navStateRef.current;
        const mapping = mappingRef.current;
        const target = mapping[direction];

        // If already in confirmingTarget for same direction, move to first target
        if (currentState.type === 'confirmingTarget' && pendingDirectionRef.current === direction) {
            const candidates = getCandidates(currentState.targetType === 'parents' ? 'parents' : 'children');
            if (candidates.length > 0) {
                onCursorChangeRef.current(candidates[0]);
                setNavState(IDLE_STATE);
                pendingDirectionRef.current = null;
            }
            return;
        }

        // Check if this is a peer navigation
        const peerDir = getPeerDirection(target);
        if (peerDir) {
            const neighbors = neighborsRef.current;
            const parentIds = Object.keys(neighbors.topological.peers);

            if (parentIds.length === 0) {
                // No parents means no peers
                return;
            }

            if (parentIds.length === 1) {
                // Single parent: navigate directly to closest peer in direction
                const peerInfo = neighbors.topological.peers[parentIds[0]];
                const targetPeer = peerDir === 'prev' ? peerInfo.prevPeer : peerInfo.nextPeer;
                if (targetPeer) {
                    onCursorChangeRef.current(targetPeer);
                    setNavState(IDLE_STATE);
                }
                return;
            }

            // Multiple parents: enter selectingParentForPeers mode
            setNavState({
                type: 'selectingParentForPeers',
                peerDirection: peerDir,
            });
            pendingDirectionRef.current = direction;
            return;
        }

        // Parent or child navigation
        const targetType = getTargetType(target);
        if (!targetType) return;

        const candidates = getCandidates(target);
        if (candidates.length === 0) return;

        if (candidates.length === 1) {
            // Single target: navigate immediately
            onCursorChangeRef.current(candidates[0]);
            setNavState(IDLE_STATE);
            pendingDirectionRef.current = null;
            return;
        }

        // Multiple targets: enter confirmingTarget mode
        setNavState({
            type: 'confirmingTarget',
            direction,
            targetType,
        });
        pendingDirectionRef.current = direction;
    }, [getCandidates, setNavState]);

    // Handle selector choice
    const handleChooseAmbiguous = useCallback((selector: string): boolean => {
        const currentState = navStateRef.current;
        const selectorsList = selectorsRef.current;
        const selectorIndex = selectorsList.indexOf(selector);

        if (selectorIndex === -1) return false;

        if (currentState.type === 'confirmingTarget') {
            const candidates = getCandidates(
                currentState.targetType === 'parents' ? 'parents' : 'children'
            );
            if (selectorIndex < candidates.length) {
                onCursorChangeRef.current(candidates[selectorIndex]);
                setNavState(IDLE_STATE);
                pendingDirectionRef.current = null;
                return true;
            }
            return false;
        }

        if (currentState.type === 'selectingParentForPeers') {
            const neighbors = neighborsRef.current;
            const parentIds = Object.keys(neighbors.topological.peers);
            if (selectorIndex < parentIds.length) {
                const parentId = parentIds[selectorIndex];
                const peerInfo = neighbors.topological.peers[parentId];
                const targetPeer = currentState.peerDirection === 'prev'
                    ? peerInfo.prevPeer
                    : peerInfo.nextPeer;
                if (targetPeer) {
                    onCursorChangeRef.current(targetPeer);
                    setNavState(IDLE_STATE);
                    pendingDirectionRef.current = null;
                    return true;
                }
            }
            return false;
        }

        return false;
    }, [getCandidates, setNavState]);

    // Handle escape
    const handleEscape = useCallback(() => {
        setNavState(IDLE_STATE);
        pendingDirectionRef.current = null;
    }, [setNavState]);

    // Create stable handle using useMemo
    const handle = useMemo<GraphNavigationHandle>(() => ({
        up: () => handleDirection('up'),
        down: () => handleDirection('down'),
        left: () => handleDirection('left'),
        right: () => handleDirection('right'),
        chooseAmbiguous: handleChooseAmbiguous,
        escape: handleEscape,
        get state() {
            return navStateRef.current;
        },
    }), [handleDirection, handleChooseAmbiguous, handleEscape]);

    return handle;
}
