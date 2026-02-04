/**
 * OutputPanel - Displays command output history in upper right corner.
 */

import { useEffect, useRef } from 'react';
import { useOutputStore, OutputLine } from '../output';

/** How long lines stay visible before fading (ms) */
const VISIBLE_DURATION = 5000;
/** How long the fade animation takes (ms) */
const FADE_DURATION = 1000;
/** How long the collapse animation takes (ms) */
const COLLAPSE_DURATION = 300;
/** Total time before cleanup */
const TOTAL_DURATION = VISIBLE_DURATION + FADE_DURATION + COLLAPSE_DURATION;

function getLineColor(type: OutputLine['type']): string {
    switch (type) {
        case 'error': return 'text-red-400';
        case 'success': return 'text-green-400';
        default: return 'text-white/80';
    }
}

export function OutputPanel() {
    const lines = useOutputStore((s) => s.lines);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new lines appear
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [lines]);

    // Periodically clean up old lines
    useEffect(() => {
        const cleanup = () => {
            const now = Date.now();
            const { lines } = useOutputStore.getState();
            const validLines = lines.filter(line => now - line.timestamp < TOTAL_DURATION);
            if (validLines.length !== lines.length) {
                useOutputStore.setState({ lines: validLines });
            }
        };
        const interval = setInterval(cleanup, 1000);
        return () => clearInterval(interval);
    }, []);

    if (lines.length === 0) {
        return null;
    }

    const fadeEnd = ((VISIBLE_DURATION + FADE_DURATION) / TOTAL_DURATION) * 100;
    const visibleEnd = (VISIBLE_DURATION / TOTAL_DURATION) * 100;

    return (
        <div className="w-80 max-h-64 pointer-events-none mt-4">
            <div
                ref={containerRef}
                className="overflow-y-auto overflow-x-hidden max-h-64 flex flex-col"
            >
                {lines.map((line) => (
                    <div
                        key={line.id}
                        className={`font-mono text-sm ${getLineColor(line.type)} overflow-hidden`}
                        style={{
                            animation: `fadeInOut ${TOTAL_DURATION}ms ease-out forwards`,
                        }}
                    >
                        {line.text}
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(-4px); max-height: 2em; }
                    3% { opacity: 1; transform: translateY(0); max-height: 2em; }
                    ${visibleEnd}% { opacity: 1; max-height: 2em; }
                    ${fadeEnd}% { opacity: 0; max-height: 2em; }
                    100% { opacity: 0; max-height: 0; margin: 0; padding: 0; }
                }
            `}</style>
        </div>
    );
}
