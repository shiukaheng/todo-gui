/**
 * GraphNavigationController - State machine for keyboard-driven graph navigation
 *
 * Owned by GraphViewerEngine. Exposes a handle for navigation actions and
 * notifies on state changes for styling updates.
 */

import { CursorNeighbors, EMPTY_CURSOR_NEIGHBORS } from "../GraphViewerEngineState";
import {
    NavState,
    NavDirection,
    NavTarget,
    NavDirectionMapping,
    GraphNavigationHandle,
    IDLE_STATE,
} from "./types";

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

export class GraphNavigationController {
    private navState: NavState = IDLE_STATE;
    private pendingDirection: NavDirection | null = null;
    private cursorNeighbors: CursorNeighbors = EMPTY_CURSOR_NEIGHBORS;

    readonly handle: GraphNavigationHandle;

    constructor(
        private readonly navDirectionMapping: NavDirectionMapping,
        private readonly selectors: string[],
        private readonly onCursorChange: (nodeId: string) => void,
        private readonly onStateChange: (state: NavState) => void
    ) {
        const self = this;
        // Create the handle that exposes navigation actions
        this.handle = {
            up: () => self.handleDirection('up'),
            down: () => self.handleDirection('down'),
            left: () => self.handleDirection('left'),
            right: () => self.handleDirection('right'),
            chooseAmbiguous: (selector: string) => self.chooseAmbiguous(selector),
            escape: () => self.escape(),
            get state() { return self.navState; },
        };
    }

    get state(): NavState {
        return this.navState;
    }

    setCursorNeighbors(neighbors: CursorNeighbors): void {
        this.cursorNeighbors = neighbors;
        this.setNavState(IDLE_STATE);
        this.pendingDirection = null;
    }

    private setNavState(newState: NavState): void {
        this.navState = newState;
        this.onStateChange(newState);
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
            const candidates = this.getCandidates(this.navState.targetType);
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

        this.setNavState({
            type: 'confirmingTarget',
            direction,
            targetType,
        });
        this.pendingDirection = direction;
    }

    private chooseAmbiguous(selector: string): boolean {
        const selectorIndex = this.selectors.indexOf(selector);
        if (selectorIndex === -1) return false;

        if (this.navState.type === 'confirmingTarget') {
            const candidates = this.getCandidates(this.navState.targetType);
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

    private escape(): void {
        this.setNavState(IDLE_STATE);
        this.pendingDirection = null;
    }
}
