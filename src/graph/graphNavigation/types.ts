/**
 * Graph Navigation Types
 *
 * Types for keyboard-driven graph navigation with disambiguation UI.
 */

// ═══════════════════════════════════════════════════════════════════════════
// STATE MACHINE: Navigation State
// ═══════════════════════════════════════════════════════════════════════════
//
//   ┌─────────┐
//   │  IDLE   │◄──────────────────────────────────────┐
//   └────┬────┘                                        │
//        │ direction pressed                           │ escape / neighbors change
//        ▼                                             │
//   ┌────────────────────┐                             │
//   │ CONFIRMING_TARGET  │─── selector pressed ───────►│ (move cursor)
//   │ (parents/children) │─── same direction ─────────►│ (move to first)
//   └────────────────────┘─────────────────────────────┘
//
//   Peer navigation (up/down) always moves directly to the closest peer,
//   regardless of how many parents the node has.
//

export type NavDirection = 'up' | 'down' | 'left' | 'right';

export type NavState =
    | { type: 'idle' }
    | {
        type: 'confirmingTarget';
        direction: NavDirection;
        targetType: 'parents' | 'children';
      };

export const IDLE_STATE: NavState = { type: 'idle' };

export function getNavInfoText(state: NavState, candidateCount: number): string | null {
    switch (state.type) {
        case 'idle':
            return null;
        case 'confirmingTarget':
            return `Select ${state.targetType} (1-${candidateCount})`;
    }
}

export interface GraphNavigationHandle {
    up(): void;
    down(): void;
    left(): void;
    right(): void;
    chooseAmbiguous(selector: string): boolean;
    escape(): void;
    readonly state: NavState;
}

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTION MAPPING
// ═══════════════════════════════════════════════════════════════════════════

export type NavTarget = 'parents' | 'children' | 'prevPeer' | 'nextPeer';

export interface NavDirectionMapping {
    up: NavTarget;
    down: NavTarget;
    left: NavTarget;
    right: NavTarget;
}

export const DEFAULT_NAV_MAPPING: NavDirectionMapping = {
    up: 'prevPeer',
    down: 'nextPeer',
    left: 'children',
    right: 'parents',
};
