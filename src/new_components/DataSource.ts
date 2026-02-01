/**
 * DataSource<T> - Bridges React's declarative world to an imperative animation loop.
 *
 * PURPOSE:
 * React updates state via props/setState, but an animation loop runs independently
 * via requestAnimationFrame. This class acts as a mailbox between them:
 * - React "drops off" new data via set()
 * - The engine "picks up" data via read() each frame
 *
 * The dirty flag lets the engine know: "has data changed since I last looked?"
 *
 * USAGE FROM REACT SIDE:
 * ```ts
 * // In a useEffect (NOT during render!) to avoid marking dirty on unrelated re-renders
 * useEffect(() => {
 *     dataSource.set(taskList);
 * }, [taskList]);
 * ```
 *
 * USAGE FROM ENGINE SIDE (inside your animation loop):
 * ```ts
 * const tick = () => {
 *     const { data, isNew } = dataSource.read();
 *
 *     if (isNew) {
 *         // Data changed! Rebuild graph structure, reset physics, etc.
 *         this.rebuildGraph(data);
 *     }
 *
 *     // Always runs: physics step, rendering, etc.
 *     this.simulatePhysics();
 *     this.render();
 *
 *     requestAnimationFrame(tick);
 * };
 * ```
 *
 * WHY NOT JUST USE A REF?
 * A ref works for reading current data, but doesn't tell you IF it changed.
 * Without that, you'd either:
 * - Rebuild the graph every frame (wasteful)
 * - Do deep comparison every frame (also wasteful)
 * - Miss updates entirely
 */
export class DataSource<T> {
    private _data: T;
    private _dirty = true;
    private _version = 0;

    constructor(initial: T) {
        this._data = initial;
    }

    /**
     * Called by React when props change.
     * Marks the data as dirty so the engine knows to process it.
     */
    set(value: T) {
        this._data = value;
        this._dirty = true;
        this._version++;
    }

    /**
     * Called by the engine each animation frame.
     * Returns the current data and whether it's new since last read.
     * Clears the dirty flag after reading.
     */
    read(): { data: T; isNew: boolean; version: number } {
        const isNew = this._dirty;
        this._dirty = false;
        return { data: this._data, isNew, version: this._version };
    }

    /**
     * Peek at data without clearing the dirty flag.
     * Useful for initialization or debugging.
     */
    peek(): T {
        return this._data;
    }
}
