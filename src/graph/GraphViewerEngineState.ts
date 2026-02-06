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
        /** Closest prev/next peer across all parents (merged) */
        peers: PeerInfo
    }
}

/** Compare two CursorNeighbors for equality */
export function cursorNeighborsEqual(a: CursorNeighbors, b: CursorNeighbors): boolean {
    const ta = a.topological;
    const tb = b.topological;

    // Compare arrays
    if (ta.children.length !== tb.children.length) return false;
    if (ta.parents.length !== tb.parents.length) return false;
    for (let i = 0; i < ta.children.length; i++) {
        if (ta.children[i] !== tb.children[i]) return false;
    }
    for (let i = 0; i < ta.parents.length; i++) {
        if (ta.parents[i] !== tb.parents[i]) return false;
    }

    // Compare peers
    if (ta.peers.prevPeer !== tb.peers.prevPeer || ta.peers.nextPeer !== tb.peers.nextPeer) return false;

    return true;
}

/** Initial empty cursor neighbors */
export const EMPTY_CURSOR_NEIGHBORS: CursorNeighbors = {
    topological: {
        children: [],
        parents: [],
        peers: { prevPeer: null, nextPeer: null },
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
            peers: { prevPeer: null, nextPeer: null },
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
    // Track which nodes have parents (to find root nodes)
    const nodesWithParents = new Set<string>();

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

        // Track nodes that have parents
        nodesWithParents.add(toId);
    }

    // Find all root nodes (nodes with no parents)
    const allNodeIds = Object.keys(positions);
    const rootNodes = allNodeIds.filter(id => !nodesWithParents.has(id));

    // Helper to compute prev/next peers from a list of peer candidates
    const computePeerInfo = (peerCandidates: string[], cursorPos: Vec2): PeerInfo | null => {
        let prevPeer: string | null = null;
        let nextPeer: string | null = null;
        let prevPeerDist = Infinity;
        let nextPeerDist = Infinity;

        for (const peerId of peerCandidates) {
            const peerPos = positions[peerId];
            if (!peerPos) continue;

            const peerAxisVal = peerPos[axisIndex];
            const cursorAxisVal = cursorPos[axisIndex];

            if (peerAxisVal < cursorAxisVal) {
                const dist = cursorAxisVal - peerAxisVal;
                if (dist < prevPeerDist) {
                    prevPeerDist = dist;
                    prevPeer = peerId;
                }
            } else if (peerAxisVal > cursorAxisVal) {
                const dist = peerAxisVal - cursorAxisVal;
                if (dist < nextPeerDist) {
                    nextPeerDist = dist;
                    nextPeer = peerId;
                }
            }
        }

        if (prevPeer !== null || nextPeer !== null) {
            return { prevPeer, nextPeer };
        }
        return null;
    };

    // Compute peers: merge siblings from all parents into one list, find closest prev/next
    const cursorPos = positions[cursorId];
    let peers: PeerInfo = { prevPeer: null, nextPeer: null };

    if (cursorPos) {
        const allPeerCandidates = new Set<string>();

        for (const parentId of parents) {
            const siblings = parentToChildren.get(parentId) || [];
            for (const id of siblings) {
                if (id !== cursorId) allPeerCandidates.add(id);
            }
        }

        // If cursor is a root node, treat other root nodes as peers too
        const cursorIsRoot = rootNodes.includes(cursorId);
        if (cursorIsRoot) {
            for (const id of rootNodes) {
                if (id !== cursorId) allPeerCandidates.add(id);
            }
        }

        if (allPeerCandidates.size > 0) {
            peers = computePeerInfo([...allPeerCandidates], cursorPos) ?? peers;
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
