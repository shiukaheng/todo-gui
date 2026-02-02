import { NestedGraphData, ExtendNestedGraphData } from "../new_utils/nestGraphData";

export type Color = [number, number, number]; // RGB color representation
export type SpecialEffect = "glow" | "none";

// ═══════════════════════════════════════════════════════════════════════════
// SEEDED PRNG (cyrb128 + sfc32)
// ═══════════════════════════════════════════════════════════════════════════

function cyrb128(str: string): [number, number, number, number] {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
        const k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
    return function() {
        a |= 0; b |= 0; c |= 0; d |= 0;
        const t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    };
}

function seededRandom(str: string): () => number {
    const seed = cyrb128(str);
    const rng = sfc32(seed[0], seed[1], seed[2], seed[3]);
    for (let i = 0; i < 15; i++) rng();
    return rng;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR SPACE CONVERSIONS
// ═══════════════════════════════════════════════════════════════════════════

function hslToRgb(h: number, s: number, l: number): Color {
    h = h * 6;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 1)      { r = c; g = x; }
    else if (h < 2) { r = x; g = c; }
    else if (h < 3) { g = c; b = x; }
    else if (h < 4) { g = x; b = c; }
    else if (h < 5) { r = x; b = c; }
    else            { r = c; b = x; }
    return [r + m, g + m, b + m];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === r)      h = (((g - b) / delta) % 6) / 6;
        else if (max === g) h = ((b - r) / delta + 2) / 6;
        else                h = ((r - g) / delta + 4) / 6;
    }
    if (h < 0) h += 1;
    return [h, max === 0 ? 0 : delta / max, max];
}

function hsvToRgb(h: number, s: number, v: number): Color {
    h = h * 6;
    const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 1)      { r = c; g = x; }
    else if (h < 2) { r = x; g = c; }
    else if (h < 3) { g = c; b = x; }
    else if (h < 4) { g = x; b = c; }
    else if (h < 5) { r = x; b = c; }
    else            { r = c; b = x; }
    return [r + m, g + m, b + m];
}

// ═══════════════════════════════════════════════════════════════════════════
// COLORING ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════

function averageColors(colors: Color[]): Color {
    if (colors.length === 0) return [0.5, 0.5, 0.5];
    const sum = colors.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]] as Color, [0, 0, 0] as Color);
    return [sum[0] / colors.length, sum[1] / colors.length, sum[2] / colors.length];
}

function randomWalkHSV(parentColor: Color, nodeId: string, deltaHue = 0.1, deltaSV = 0.1): Color {
    const [h, s, v] = rgbToHsv(parentColor[0], parentColor[1], parentColor[2]);
    const rng = seededRandom(nodeId + "_walk");
    const clampHue = (x: number) => ((x % 1) + 1) % 1;
    const clampSV = (x: number) => Math.max(0, Math.min(1, x));
    return hsvToRgb(
        clampHue(h + (rng() - 0.5) * 2 * deltaHue),
        clampSV(s + (rng() - 0.5) * 2 * deltaSV),
        clampSV(v + (rng() - 0.5) * 2 * deltaSV)
    );
}

function initialColor(nodeId: string): Color {
    const rng = seededRandom(nodeId);
    return hslToRgb(rng(), 0.55 + rng() * 0.30, 0.45 + rng() * 0.20);
}

function computeNodeColors<G extends NestedGraphData>(graphData: G): Map<string, Color> {
    const { tasks, dependencies } = graphData;
    const taskIds = Object.keys(tasks);

    // Build parent map
    const parentsMap = new Map<string, string[]>();
    for (const id of taskIds) parentsMap.set(id, []);
    for (const dep of Object.values(dependencies)) {
        parentsMap.get(dep.data.toId)?.push(dep.data.fromId);
    }

    // Topological sort
    const visited = new Set<string>();
    const sorted: string[] = [];
    function dfs(id: string) {
        if (visited.has(id)) return;
        visited.add(id);
        for (const pid of parentsMap.get(id) || []) dfs(pid);
        sorted.push(id);
    }
    for (const id of taskIds) dfs(id);

    // Compute colors
    const colors = new Map<string, Color>();
    for (const nodeId of sorted) {
        const parentColors = (parentsMap.get(nodeId) || [])
            .map(pid => colors.get(pid))
            .filter((c): c is Color => c !== undefined);
        colors.set(nodeId, parentColors.length > 0
            ? randomWalkHSV(averageColors(parentColors), nodeId)
            : initialColor(nodeId));
    }
    return colors;
}

export type StyledGraphData<G extends NestedGraphData> = ExtendNestedGraphData<
    // Node extra properties
    {
        text: string;
        color: Color;
        borderColor: Color;
        opacity: number;
        specialEffect: SpecialEffect;
    },
    // Edge extra properties
    {
        text: string;
        color: Color;
        opacity: number;
        dotted: boolean;
    }, G
>;

export function styleGraphData<G extends NestedGraphData>(graphData: G): StyledGraphData<G> {
    const nodeColors = computeNodeColors(graphData);

    return {
        tasks: Object.fromEntries(
            Object.entries(graphData.tasks).map(([taskId, taskWrapper]) => [
                taskId,
                { ...taskWrapper, text: taskId, color: nodeColors.get(taskId) || [1, 1, 1] as Color, borderColor: [0.5, 0.5, 0.5] as Color, opacity: 1.0, specialEffect: "none" as SpecialEffect },
            ])
        ),
        dependencies: Object.fromEntries(
            Object.entries(graphData.dependencies).map(([depId, depWrapper]) => [
                depId,
                { ...depWrapper, text: "", color: [0.75, 0.75, 0.75] as Color, opacity: 0.8, dotted: false },
            ])
        ),
    } as StyledGraphData<G>;
}
