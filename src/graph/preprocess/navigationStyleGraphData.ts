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

function getArrowForTarget(target: NavTarget): string {
    switch (target) {
        case 'parents': return '→';
        case 'children': return '←';
        case 'prevPeer': return '↑';
        case 'nextPeer': return '↓';
    }
}

export function navigationStyleGraphData<G extends StyledGraphData<NestedGraphData>>(
    graphData: G,
    cursorNeighbors: CursorNeighbors,
    navState: NavState,
    selectors: string[],
    _directionMapping: NavDirectionMapping
): G {
    const { topological } = cursorNeighbors;
    const { parents, children, peers } = topological;

    // Build a map of nodeId -> overlay text
    const overlays = new Map<string, string>();

    // Get arrows for each target type based on direction mapping
    const parentArrow = getArrowForTarget('parents');
    const childArrow = getArrowForTarget('children');
    const prevPeerArrow = getArrowForTarget('prevPeer');
    const nextPeerArrow = getArrowForTarget('nextPeer');

    // Parents overlay
    if (parents.length === 1) {
        overlays.set(parents[0], parentArrow);
    } else {
        parents.forEach((parentId, index) => {
            if (index < selectors.length) {
                overlays.set(parentId, `${parentArrow}${selectors[index]}`);
            }
        });
    }

    // Children overlay
    if (children.length === 1) {
        overlays.set(children[0], childArrow);
    } else {
        children.forEach((childId, index) => {
            if (index < selectors.length) {
                overlays.set(childId, `${childArrow}${selectors[index]}`);
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
            // Show numbered hints on parents during selection
            parentIds.forEach((parentId, index) => {
                if (index < selectors.length) {
                    const arrow = navState.peerDirection === 'prev' ? prevPeerArrow : nextPeerArrow;
                    overlays.set(parentId, `${arrow}${selectors[index]}`);
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
