/**
 * navigationStyleGraphData - Apply navigation hint overlays to graph nodes
 *
 * Shows shortcut key overlays on nodes to indicate navigation options:
 * - Parents: →1, →2, →3 (or just → if single)
 * - Children: ←1, ←2 (or just ← if single)
 * - Peers: ↑/↓ on adjacent peers (or ↑?/↓? if multi-parent)
 */

import { NestedGraphData } from "./nestGraphData";
import { StyledGraphData } from "./styleGraphData";
import { CursorNeighbors } from "../GraphViewerEngineState";
import { NavState, NavDirectionMapping, NavTarget } from "../graphNavigation/types";

type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_ARROWS: Record<Direction, string> = {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
};

function getArrowForTarget(target: NavTarget, mapping: NavDirectionMapping): string {
    // Find which direction maps to this target
    for (const [dir, t] of Object.entries(mapping)) {
        if (t === target) return DIRECTION_ARROWS[dir as Direction];
    }
    // Fallback
    return '?';
}

export function navigationStyleGraphData<G extends StyledGraphData<NestedGraphData>>(
    graphData: G,
    cursorNeighbors: CursorNeighbors,
    navState: NavState,
    selectors: string[],
    directionMapping: NavDirectionMapping
): G {
    const { topological } = cursorNeighbors;
    const { parents, children, peers } = topological;

    // Build a map of nodeId -> overlay text
    const overlays = new Map<string, string>();

    // Get arrows for each target type based on direction mapping
    const parentArrow = getArrowForTarget('parents', directionMapping);
    const childArrow = getArrowForTarget('children', directionMapping);
    const prevPeerArrow = getArrowForTarget('prevPeer', directionMapping);
    const nextPeerArrow = getArrowForTarget('nextPeer', directionMapping);

    // Check if we're in disambiguation mode
    const isConfirmingParents = navState.type === 'confirmingTarget' && navState.targetType === 'parents';
    const isConfirmingChildren = navState.type === 'confirmingTarget' && navState.targetType === 'children';

    // Parents overlay
    if (parents.length === 1) {
        overlays.set(parents[0], parentArrow);
    } else {
        parents.forEach((parentId, index) => {
            if (index < selectors.length) {
                // When disambiguating, show just the number
                overlays.set(parentId, isConfirmingParents ? selectors[index] : `${parentArrow}${selectors[index]}`);
            }
        });
    }

    // Children overlay
    if (children.length === 1) {
        overlays.set(children[0], childArrow);
    } else {
        children.forEach((childId, index) => {
            if (index < selectors.length) {
                // When disambiguating, show just the number
                overlays.set(childId, isConfirmingChildren ? selectors[index] : `${childArrow}${selectors[index]}`);
            }
        });
    }

    // Peers overlay
    const parentIds = Object.keys(peers);
    const hasMultipleParents = parentIds.length > 1;

    if (parentIds.length === 1) {
        // Single parent: show up/down arrows on closest peers
        const peerInfo = peers[parentIds[0]];
        if (peerInfo.prevPeer) {
            overlays.set(peerInfo.prevPeer, prevPeerArrow);
        }
        if (peerInfo.nextPeer) {
            overlays.set(peerInfo.nextPeer, nextPeerArrow);
        }
    } else if (hasMultipleParents) {
        // Multiple parents: show ?-suffixed arrows to indicate disambiguation needed
        // When in selectingParentForPeers mode, show numbered parent hints
        if (navState.type === 'selectingParentForPeers') {
            // Show just numbers on parents during selection
            parentIds.forEach((parentId, index) => {
                if (index < selectors.length) {
                    overlays.set(parentId, selectors[index]);
                }
            });
        } else {
            // Show ? hints on peers to indicate disambiguation needed
            for (const parentId of parentIds) {
                const peerInfo = peers[parentId];
                // Show ? on whichever peers exist for this parent
                if (peerInfo.prevPeer && !overlays.has(peerInfo.prevPeer)) {
                    overlays.set(peerInfo.prevPeer, `${prevPeerArrow}?`);
                }
                if (peerInfo.nextPeer && !overlays.has(peerInfo.nextPeer)) {
                    overlays.set(peerInfo.nextPeer, `${nextPeerArrow}?`);
                }
            }
        }
    }

    // When in confirmingTarget mode, highlight the active direction's targets more prominently
    // (The overlays are already showing numbers, this is mainly for potential future styling)

    // Apply overlays to graph data
    return {
        ...graphData,
        tasks: Object.fromEntries(
            Object.entries(graphData.tasks).map(([taskId, task]) => {
                const overlay = overlays.get(taskId);
                if (overlay !== undefined) {
                    return [taskId, { ...task, shortcutKeyOverlay: overlay }];
                }
                return [taskId, task];
            })
        ),
    } as G;
}
