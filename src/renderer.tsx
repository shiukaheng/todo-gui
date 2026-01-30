import { createRoot } from "react-dom/client";
import "./index.css";
import { GraphViewer } from "./view/GraphViewer";
import { useTodoGraph } from "./client/useNeo4jGraph";
import { convertTaskListToGraphData } from "./client/convertTaskListToGraphData";
import { colorNodes } from "./common/colorNodes";

const todoConfig = {
    baseUrl: 'http://100.78.182.4:8000',
};

function App() {
    const { graphData: taskList } = useTodoGraph(todoConfig);

    if (!taskList) return null;

    // Convert from API format to internal graph format
    const graphData = convertTaskListToGraphData(taskList);

    // Apply colors to nodes based on their IDs
    const coloredGraphData = colorNodes(graphData);

    return <GraphViewer graphData={coloredGraphData} />;
}

createRoot(document.getElementById('root')!).render(<App />)
