export type ViewTraceScope = 'Store' | 'Graph' | 'Position' | 'WebCola';

let seq = 0;

function isEnabled(): boolean {
    if (!import.meta.env.DEV) return false;
    const w = window as Window & { __VIEW_TRACE__?: boolean };
    if (typeof w.__VIEW_TRACE__ === 'boolean') return w.__VIEW_TRACE__;
    try {
        const v = localStorage.getItem('todo.viewTrace');
        if (v === '0' || v === 'false') return false;
        if (v === '1' || v === 'true') return true;
    } catch {
        // ignore storage issues
    }
    return true;
}

export function viewTrace(scope: ViewTraceScope, event: string, details: Record<string, unknown> = {}): void {
    if (!isEnabled()) return;
    seq += 1;
    console.log(`[ViewTrace][${scope}] #${seq} ${event}`, {
        ts: Date.now(),
        ...details,
    });
}

