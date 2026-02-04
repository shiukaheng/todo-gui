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
        // Only auto-connect if a default URL is configured
        const defaultUrl = window.__CONFIG__?.defaultApiUrl;
        if (defaultUrl) {
            return subscribe(defaultUrl);
        }
    }, [subscribe]);

    return <GraphViewer />;
}

createRoot(document.getElementById('root')!).render(<App />)
