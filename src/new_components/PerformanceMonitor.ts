import Stats from "stats.js";

/**
 * Wrapper around stats.js for performance monitoring.
 *
 * Usage:
 *   const monitor = new PerformanceMonitor(container);
 *   // In animation loop:
 *   monitor.begin();
 *   // ... frame work ...
 *   monitor.end();
 *
 * Panels:
 *   0 = FPS (frames per second)
 *   1 = MS (milliseconds per frame)
 *   2 = MB (memory, Chrome only)
 */
export class PerformanceMonitor {
    private stats: Stats;

    constructor(container: HTMLElement, panel: 0 | 1 | 2 = 0) {
        this.stats = new Stats();
        this.stats.showPanel(panel);

        // Position in bottom-right corner (clear stats.js defaults first)
        this.stats.dom.style.position = "absolute";
        this.stats.dom.style.top = "";
        this.stats.dom.style.left = "";
        this.stats.dom.style.bottom = "0";
        this.stats.dom.style.right = "0";

        container.appendChild(this.stats.dom);
    }

    /** Call at the start of each frame */
    begin(): void {
        this.stats.begin();
    }

    /** Call at the end of each frame */
    end(): void {
        this.stats.end();
    }

    /** Switch displayed panel (0=FPS, 1=MS, 2=MB) */
    showPanel(panel: 0 | 1 | 2): void {
        this.stats.showPanel(panel);
    }

    /** Remove from DOM */
    destroy(): void {
        this.stats.dom.remove();
    }
}
