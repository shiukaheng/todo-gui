/**
 * OutputPanel - Displays command output history in upper right corner.
 */

import { useEffect, useRef, useState } from 'react';
import { useOutputStore, type OutputLine } from '../output';

/** How long lines stay visible before fading (ms) */
const VISIBLE_DURATION = 5000;
/** How long the fade+collapse animation takes (ms) */
const FADE_DURATION = 800;
/** Total time before cleanup */
const TOTAL_DURATION = VISIBLE_DURATION + FADE_DURATION;

function getLineColor(type: OutputLine['type']): string {
    switch (type) {
        case 'error': return 'text-red-400';
        case 'success': return 'text-green-400';
        default: return 'text-white/80';
    }
}

/** Single output line with dynamic height collapse */
function OutputLineItem({ line, visibleEnd }: {
    line: OutputLine;
    visibleEnd: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | null>(null);

    useEffect(() => {
        if (ref.current) {
            setHeight(ref.current.scrollHeight);
        }
    }, []);

    return (
        <div
            ref={ref}
            className={`font-mono text-sm ${getLineColor(line.type)} overflow-hidden`}
            style={{
                animation: height !== null
                    ? `fadeInOut-${line.id} ${TOTAL_DURATION}ms ease-out forwards`
                    : undefined,
                opacity: height === null ? 0 : undefined,
            }}
        >
            {line.text}
            {height !== null && (
                <style>{`
                    @keyframes fadeInOut-${line.id} {
                        0% { opacity: 0; transform: translateY(-4px); max-height: ${height}px; }
                        3% { opacity: 1; transform: translateY(0); max-height: ${height}px; }
                        ${visibleEnd}% { opacity: 1; max-height: ${height}px; }
                        100% { opacity: 0; max-height: 0; }
                    }
                `}</style>
            )}
        </div>
    );
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

    const visibleEnd = (VISIBLE_DURATION / TOTAL_DURATION) * 100;

    return (
        <div className="w-96 pointer-events-none mt-4">
            <div
                ref={containerRef}
                className="flex flex-col"
            >
                {lines.map((line) => (
                    <OutputLineItem
                        key={line.id}
                        line={line}
                        visibleEnd={visibleEnd}
                    />
                ))}
            </div>
        </div>
    );
}
