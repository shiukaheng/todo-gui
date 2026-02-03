import { createRoot } from "react-dom/client";
import "./index.css";
import { TodoProvider } from "./graph/TodoContext";
import { GraphViewer } from "./graph/GraphViewer";
import { useTodo } from "./graph/TodoContext";

const todoConfig = {
    baseUrl: 'http://100.78.182.4:8000',
};

function App() {
    const { graphData } = useTodo();
    if (!graphData) return null;
    return <GraphViewer />;
}

createRoot(document.getElementById('root')!).render(
    <TodoProvider config={todoConfig}>
        <App />
    </TodoProvider>
)
