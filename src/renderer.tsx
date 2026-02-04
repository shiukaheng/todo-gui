import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { GraphViewer } from "./graph/GraphViewer";
import { useTodoStore } from "./stores/todoStore";

const BASE_URL = 'http://localhost:8000';

function App() {
    
    const subscribe = useTodoStore((s) => s.subscribe);
    useEffect(() => {
        return subscribe(BASE_URL);
    }, [subscribe]);

    return <GraphViewer />;
}

createRoot(document.getElementById('root')!).render(<App />)
