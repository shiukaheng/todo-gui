/**
 * 2D homogeneous transformation matrix (3x3 with implicit bottom row [0, 0, 1]):
 *
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0  1  |
 *
 * Transforms world coordinates to screen: x' = a*x + c*y + tx, y' = b*x + d*y + ty
 */
export interface ViewTransform {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

export type Color = [number, number, number];
export type Vec2 = [number, number];

export interface RenderNode {
    data: { id: string };
    text: string;
    color: Color;
    borderColor: Color;
    opacity: number;
    position: Vec2;
}

export interface RenderEdge {
    data: { fromId: string; toId: string };
    text: string;
    color: Color;
    opacity: number;
    dotted: boolean;
}

export interface RenderGraphData {
    tasks: { [key: string]: RenderNode };
    dependencies: { [key: string]: RenderEdge };
}

export const FONT_SIZE = 20;
export const STROKE_WIDTH = 2;
export const PADDING = 8;

export function colorToCSS(color: Color): string {
    return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}

export function getTextColor(bg: Color): string {
    const luminance = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
    return luminance > 0.5 ? "black" : "white";
}

export function worldToScreen(pos: Vec2, t: ViewTransform): Vec2 {
    return [
        t.a * pos[0] + t.c * pos[1] + t.tx,
        t.b * pos[0] + t.d * pos[1] + t.ty,
    ];
}
