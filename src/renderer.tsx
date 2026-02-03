import { createRoot } from "react-dom/client";
import "./index.css";
import { useTodoGraph } from "./graph/useTodoGraph";
import { GraphViewer } from "./graph/GraphViewer";

const todoConfig = {
    baseUrl: 'http://100.78.182.4:8000',
};

function App() {
    const { graphData: taskList } = useTodoGraph(todoConfig);
    if (!taskList) return null;
    return <GraphViewer taskList={taskList} />;
}

createRoot(document.getElementById('root')!).render(<App />)
