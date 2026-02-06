/**
 * GraphNavigationController - State machine for keyboard-driven graph navigation.
 */

import { CursorNeighbors, EMPTY_CURSOR_NEIGHBORS } from "../GraphViewerEngineState";
import {
    NavState,
    NavDirection,
    NavTarget,
    NavDirectionMapping,
    GraphNavigationHandle,
    IDLE_STATE,
    getNavInfoText,
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
        private readonly onNavInfoTextChange: (text: string | null) => void,
        private readonly onSelectNearestToCenter?: () => boolean,
    ) {
        const self = this;
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

    private setCursor(nodeId: string): void {
        this.onCursorChange(nodeId);
    }

    private setNavState(newState: NavState): void {
        this.navState = newState;
        this.emitNavInfoText();
    }

    private emitNavInfoText(): void {
        let candidateCount = 0;
        if (this.navState.type === 'confirmingTarget') {
            const { topological } = this.cursorNeighbors;
            candidateCount = this.navState.targetType === 'parents'
                ? topological.parents.length
                : topological.children.length;
        }
        this.onNavInfoTextChange(getNavInfoText(this.navState, candidateCount));
    }

    private getCandidates(target: NavTarget): string[] {
        const { topological } = this.cursorNeighbors;

        switch (target) {
            case 'parents':
                return topological.parents;
            case 'children':
                return topological.children;
            case 'prevPeer': {
                const peer = topological.peers.prevPeer;
                return peer ? [peer] : [];
            }
            case 'nextPeer': {
                const peer = topological.peers.nextPeer;
                return peer ? [peer] : [];
            }
        }
    }

    private hasNoCursor(): boolean {
        const { topological } = this.cursorNeighbors;
        return (
            topological.children.length === 0 &&
            topological.parents.length === 0 &&
            topological.peers.prevPeer === null &&
            topological.peers.nextPeer === null
        );
    }

    private handleDirection(direction: NavDirection): void {
        // No cursor - select nearest node to screen center
        if (this.hasNoCursor()) {
            this.onSelectNearestToCenter?.();
            return;
        }

        const target = this.navDirectionMapping[direction];

        // If already in confirmingTarget for same direction, move to first target
        if (this.navState.type === 'confirmingTarget' && this.pendingDirection === direction) {
            const candidates = this.getCandidates(this.navState.targetType);
            if (candidates.length > 0) {
                this.setCursor(candidates[0]);
                this.setNavState(IDLE_STATE);
                this.pendingDirection = null;
            }
            return;
        }

        // Check if this is a peer navigation
        const peerDir = getPeerDirection(target);
        if (peerDir) {
            const { peers } = this.cursorNeighbors.topological;
            const targetPeer = peerDir === 'prev' ? peers.prevPeer : peers.nextPeer;
            if (targetPeer) {
                this.setCursor(targetPeer);
                this.setNavState(IDLE_STATE);
            }
            return;
        }

        // Parent or child navigation
        const targetType = getTargetType(target);
        if (!targetType) return;

        const candidates = this.getCandidates(target);
        if (candidates.length === 0) return;

        if (candidates.length === 1) {
            this.setCursor(candidates[0]);
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
                this.setCursor(candidates[selectorIndex]);
                this.setNavState(IDLE_STATE);
                this.pendingDirection = null;
                return true;
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
