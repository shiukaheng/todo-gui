import { createRoot } from "react-dom/client";
import "./index.css";
import { GraphViewer } from "./view/GraphViewer";
import { useNeo4jGraph } from "./renderer/useNeo4jGraph";
import { colorNodes } from "./common/colorNodes";

const neo4jConfig = {
    uri: 'bolt://100.78.182.4:7687',
    username: 'neo4j',
    password: 'password123',
    database: 'neo4j',
};

function App() {
    const { graphData } = useNeo4jGraph(neo4jConfig);

    if (!graphData) return null;

    // Apply colors to nodes based on their IDs
    const coloredGraphData = colorNodes(graphData);

    return <GraphViewer graphData={coloredGraphData} />;
}

createRoot(document.getElementById('root')!).render(<App />)