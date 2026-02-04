/**
 * Cursor navigation types and utilities for the graph viewer.
 */

export type PeerInfo = {
    /** Closest peer above cursor (lower Y), or null if none */
    prevPeer: string | null;
    /** Closest peer below cursor (higher Y), or null if none */
    nextPeer: string | null;
}

export type CursorNeighbors = {
    topological: {
        children: string[]
        parents: string[]
        /** For each parent, the prev/next peers relative to cursor position */
        peers: {
            [parentId: string]: PeerInfo
        }
    }
}

/** Initial empty cursor neighbors */
export const EMPTY_CURSOR_NEIGHBORS: CursorNeighbors = {
    topological: {
        children: [],
        parents: [],
        peers: {},
    },
};

export type SortAxis = 'x' | 'y';

type Vec2 = [number, number];

/**
 * Compute the relevant neighbors for a cursor node.
 *
 * @param cursorId - The ID of the cursor node, or null if no cursor
 * @param dependencies - Map of dependency ID to { data: { fromId, toId } }
 * @param positions - Map of node ID to [x, y] position
 * @param sortDir - Axis to sort neighbors by ('x' or 'y', default 'y')
 * @returns CursorNeighbors with children, parents, and peers sorted by position
 */
export function computeCursorNeighbors(
    cursorId: string | null,
    dependencies: { [key: string]: { data: { fromId: string; toId: string } } },
    positions: { [key: string]: Vec2 },
    sortDir: SortAxis = 'y'
): CursorNeighbors {
    const empty: CursorNeighbors = {
        topological: {
            children: [],
            parents: [],
            peers: {},
        },
    };

    if (!cursorId) {
        return empty;
    }

    const axisIndex = sortDir === 'x' ? 0 : 1;

    const sortByAxis = (ids: string[]): string[] => {
        return [...ids].sort((a, b) => {
            const posA = positions[a];
            const posB = positions[b];
            if (!posA || !posB) return 0;
            return posA[axisIndex] - posB[axisIndex];
        });
    };

    const children: string[] = [];
    const parents: string[] = [];

    // Build parent->children map for peer computation
    const parentToChildren: Map<string, string[]> = new Map();

    for (const dep of Object.values(dependencies)) {
        const { fromId, toId } = dep.data;

        // cursor -> child (cursor is parent, toId is child)
        if (fromId === cursorId) {
            children.push(toId);
        }

        // parent -> cursor (fromId is parent, cursor is child)
        if (toId === cursorId) {
            parents.push(fromId);
        }

        // Build parent->children index for peer lookup
        if (!parentToChildren.has(fromId)) {
            parentToChildren.set(fromId, []);
        }
        parentToChildren.get(fromId)!.push(toId);
    }

    // Compute peers: for each parent, find closest peer above and below cursor
    const cursorPos = positions[cursorId];
    const peers: { [parentId: string]: PeerInfo } = {};

    for (const parentId of parents) {
        const siblings = parentToChildren.get(parentId) || [];
        // Exclude the cursor itself from peers
        const peersForParent = siblings.filter(id => id !== cursorId);

        if (peersForParent.length > 0 && cursorPos) {
            let prevPeer: string | null = null;
            let nextPeer: string | null = null;
            let prevPeerDist = Infinity;
            let nextPeerDist = Infinity;

            for (const peerId of peersForParent) {
                const peerPos = positions[peerId];
                if (!peerPos) continue;

                const peerAxisVal = peerPos[axisIndex];
                const cursorAxisVal = cursorPos[axisIndex];

                if (peerAxisVal < cursorAxisVal) {
                    // Peer is above cursor (lower Y)
                    const dist = cursorAxisVal - peerAxisVal;
                    if (dist < prevPeerDist) {
                        prevPeerDist = dist;
                        prevPeer = peerId;
                    }
                } else if (peerAxisVal > cursorAxisVal) {
                    // Peer is below cursor (higher Y)
                    const dist = peerAxisVal - cursorAxisVal;
                    if (dist < nextPeerDist) {
                        nextPeerDist = dist;
                        nextPeer = peerId;
                    }
                }
            }

            if (prevPeer !== null || nextPeer !== null) {
                peers[parentId] = { prevPeer, nextPeer };
            }
        }
    }

    return {
        topological: {
            children: sortByAxis(children),
            parents: sortByAxis(parents),
            peers,
        },
    };
}
