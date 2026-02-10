import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { GraphViewer } from "./graph/GraphViewer";
import { useTodoStore } from "./stores/todoStore";

// Runtime config injected via index.html (can be set by docker/server)
declare global {
    interface Window {
        __CONFIG__?: {
            defaultApiUrl?: string | null;
        };
    }
}

function App() {
    const subscribe = useTodoStore((s) => s.subscribe);

    useEffect(() => {
        // Auto-connect using configured URL or current origin
        // Empty string -> use current origin (works with dev proxy and production nginx)
        // Explicit URL -> use that URL (for external API servers)
        const configuredUrl = window.__CONFIG__?.defaultApiUrl;
        const defaultUrl = configuredUrl !== null && configuredUrl !== undefined
            ? (configuredUrl || window.location.origin)
            : null;

        if (defaultUrl) {
            return subscribe(defaultUrl);
        }
    }, [subscribe]);

    return <GraphViewer />;
}

createRoot(document.getElementById('root')!).render(<App />)
