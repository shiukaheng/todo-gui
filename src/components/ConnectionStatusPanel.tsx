/**
 * ConnectionStatusPanel - Shows connection status only when there's an issue.
 * Hidden when connected successfully.
 */

import { useTodoStore } from '../stores/todoStore';

export function ConnectionStatusPanel() {
    const connectionStatus = useTodoStore((s) => s.connectionStatus);
    const baseUrl = useTodoStore((s) => s.baseUrl);
    const lastError = useTodoStore((s) => s.lastError);

    // Don't show anything when connected
    if (connectionStatus === 'connected') {
        return null;
    }

    return (
        <div className="mb-4 font-mono text-sm">
            {connectionStatus === 'disconnected' && (
                <div className="text-white/60">
                    Not connected
                </div>
            )}

            {connectionStatus === 'connecting' && (
                <div className="text-yellow-400/80">
                    Connecting to {baseUrl}...
                </div>
            )}

            {connectionStatus === 'error' && (
                <div className="text-red-400">
                    <div>Connection error: {lastError}</div>
                    <div className="text-white/40 text-xs mt-1">{baseUrl}</div>
                </div>
            )}
        </div>
    );
}
