import { Vector } from "./vector";

export function vectorDifference(a: Vector, b: Vector): Vector {
    return a.map((value, index) => value - b[index]);
}

export function vectorSum(a: Vector, b: Vector): Vector {
    return a.map((value, index) => value + b[index]);
}

export function vectorScalarMultiply(vector: Vector, scalar: number): Vector {
    return vector.map(value => value * scalar);
}

export function magnitude(vector: Vector): number {
    return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function vectorCapMaximumMagnitude(vector: Vector, maximumMagnitude: number): Vector {
    const currentMagnitude = magnitude(vector);
    if (currentMagnitude <= maximumMagnitude) {
        return vector;
    }
    return vectorScalarMultiply(vector, maximumMagnitude / currentMagnitude);
}