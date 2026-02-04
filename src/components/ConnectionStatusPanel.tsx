/**
 * ConnectionStatusPanel - Shows connection status only when there's an issue.
 * Hidden when connected successfully.
 */

import { useTodoStore } from '../stores/todoStore';

export function ConnectionStatusPanel() {
    const connectionStatus = useTodoStore((s) => s.connectionStatus);
    const baseUrl = useTodoStore((s) => s.baseUrl);
    const lastError = useTodoStore((s) => s.lastError);
    const subscribe = useTodoStore((s) => s.subscribe);

    // Don't show anything when connected
    if (connectionStatus === 'connected') {
        return null;
    }

    const handleConnect = () => {
        const url = baseUrl || 'http://localhost:8000';
        subscribe(url);
    };

    return (
        <div className="mb-4 font-mono text-sm">
            {connectionStatus === 'disconnected' && (
                <div className="text-white/60">
                    <span>Not connected</span>
                    <button
                        onClick={handleConnect}
                        className="ml-2 px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white/80"
                    >
                        Connect
                    </button>
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
                    <div className="text-white/60 mt-1">
                        <span>{baseUrl}</span>
                        <button
                            onClick={handleConnect}
                            className="ml-2 px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white/80"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
