/**
 * GraphNavigationController - Imperative class for keyboard-driven graph navigation
 *
 * Implements the navigation state machine for traversing the graph with
 * disambiguation UI for multiple targets.
 */

import { CursorNeighbors, EMPTY_CURSOR_NEIGHBORS } from "../GraphViewerEngineState";
import {
    NavState,
    NavDirection,
    NavTarget,
    NavDirectionMapping,
    GraphNavigationHandle,
    IDLE_STATE,
    DEFAULT_NAV_MAPPING,
} from "./types";

export interface GraphNavigationControllerOptions {
    onCursorChange: (nodeId: string) => void;
    onNavStateChange: (state: NavState) => void;
    navDirectionMapping?: NavDirectionMapping;
    selectors?: string[];
}

const DEFAULT_SELECTORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

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

export class GraphNavigationController implements GraphNavigationHandle {
    private navState: NavState = IDLE_STATE;
    private pendingDirection: NavDirection | null = null;
    private cursorNeighbors: CursorNeighbors = EMPTY_CURSOR_NEIGHBORS;
    private navDirectionMapping: NavDirectionMapping;
    private selectors: string[];
    private onCursorChange: (nodeId: string) => void;
    private onNavStateChange: (state: NavState) => void;

    constructor(options: GraphNavigationControllerOptions) {
        this.onCursorChange = options.onCursorChange;
        this.onNavStateChange = options.onNavStateChange;
        this.navDirectionMapping = options.navDirectionMapping ?? DEFAULT_NAV_MAPPING;
        this.selectors = options.selectors ?? DEFAULT_SELECTORS;
    }

    get state(): NavState {
        return this.navState;
    }

    setCursorNeighbors(neighbors: CursorNeighbors): void {
        this.cursorNeighbors = neighbors;
        // Reset to IDLE when neighbors change
        this.setNavState(IDLE_STATE);
        this.pendingDirection = null;
    }

    setNavDirectionMapping(mapping: NavDirectionMapping): void {
        this.navDirectionMapping = mapping;
    }

    setSelectors(selectors: string[]): void {
        this.selectors = selectors;
    }

    private setNavState(newState: NavState): void {
        this.navState = newState;
        this.onNavStateChange(newState);
    }

    private getCandidates(target: NavTarget): string[] {
        const { topological } = this.cursorNeighbors;

        switch (target) {
            case 'parents':
                return topological.parents;
            case 'children':
                return topological.children;
            case 'prevPeer':
            case 'nextPeer': {
                const parentIds = Object.keys(topological.peers);
                if (parentIds.length === 1) {
                    const peerInfo = topological.peers[parentIds[0]];
                    const peer = target === 'prevPeer' ? peerInfo.prevPeer : peerInfo.nextPeer;
                    return peer ? [peer] : [];
                }
                return [];
            }
        }
    }

    private handleDirection(direction: NavDirection): void {
        const target = this.navDirectionMapping[direction];

        // If already in confirmingTarget for same direction, move to first target
        if (this.navState.type === 'confirmingTarget' && this.pendingDirection === direction) {
            const candidates = this.getCandidates(this.navState.targetType === 'parents' ? 'parents' : 'children');
            if (candidates.length > 0) {
                this.onCursorChange(candidates[0]);
                this.setNavState(IDLE_STATE);
                this.pendingDirection = null;
            }
            return;
        }

        // Check if this is a peer navigation
        const peerDir = getPeerDirection(target);
        if (peerDir) {
            const parentIds = Object.keys(this.cursorNeighbors.topological.peers);

            if (parentIds.length === 0) {
                return;
            }

            if (parentIds.length === 1) {
                const peerInfo = this.cursorNeighbors.topological.peers[parentIds[0]];
                const targetPeer = peerDir === 'prev' ? peerInfo.prevPeer : peerInfo.nextPeer;
                if (targetPeer) {
                    this.onCursorChange(targetPeer);
                    this.setNavState(IDLE_STATE);
                }
                return;
            }

            // Multiple parents: enter selectingParentForPeers mode
            this.setNavState({
                type: 'selectingParentForPeers',
                peerDirection: peerDir,
            });
            this.pendingDirection = direction;
            return;
        }

        // Parent or child navigation
        const targetType = getTargetType(target);
        if (!targetType) return;

        const candidates = this.getCandidates(target);
        if (candidates.length === 0) return;

        if (candidates.length === 1) {
            this.onCursorChange(candidates[0]);
            this.setNavState(IDLE_STATE);
            this.pendingDirection = null;
            return;
        }

        // Multiple targets: enter confirmingTarget mode
        this.setNavState({
            type: 'confirmingTarget',
            direction,
            targetType,
        });
        this.pendingDirection = direction;
    }

    up(): void {
        this.handleDirection('up');
    }

    down(): void {
        this.handleDirection('down');
    }

    left(): void {
        this.handleDirection('left');
    }

    right(): void {
        this.handleDirection('right');
    }

    chooseAmbiguous(selector: string): boolean {
        const selectorIndex = this.selectors.indexOf(selector);
        if (selectorIndex === -1) return false;

        if (this.navState.type === 'confirmingTarget') {
            const candidates = this.getCandidates(
                this.navState.targetType === 'parents' ? 'parents' : 'children'
            );
            if (selectorIndex < candidates.length) {
                this.onCursorChange(candidates[selectorIndex]);
                this.setNavState(IDLE_STATE);
                this.pendingDirection = null;
                return true;
            }
            return false;
        }

        if (this.navState.type === 'selectingParentForPeers') {
            const parentIds = Object.keys(this.cursorNeighbors.topological.peers);
            if (selectorIndex < parentIds.length) {
                const parentId = parentIds[selectorIndex];
                const peerInfo = this.cursorNeighbors.topological.peers[parentId];
                const targetPeer = this.navState.peerDirection === 'prev'
                    ? peerInfo.prevPeer
                    : peerInfo.nextPeer;
                if (targetPeer) {
                    this.onCursorChange(targetPeer);
                    this.setNavState(IDLE_STATE);
                    this.pendingDirection = null;
                    return true;
                }
            }
            return false;
        }

        return false;
    }

    escape(): void {
        this.setNavState(IDLE_STATE);
        this.pendingDirection = null;
    }
}
