import React, { useState } from 'react';
import { useNeo4jGraph } from './useNeo4jGraph';
import { GraphViewer } from '../view/GraphViewer';
import { Neo4jConnectionConfig } from './Neo4jGraphClient';

/**
 * Example component showing how to integrate Neo4j with GraphViewer
 * 
 * This demonstrates:
 * 1. Connection form for Neo4j credentials
 * 2. Using the useNeo4jGraph hook
 * 3. Displaying connection status
 * 4. Passing live graph data to GraphViewer
 */
export const Neo4jGraphViewerExample: React.FC = () => {
  const [config, setConfig] = useState<Neo4jConnectionConfig | null>(null);
  const [formData, setFormData] = useState({
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: '',
    database: 'neo4j',
  });

  const { connectionState, graphData, error, refresh, disconnect } = useNeo4jGraph(
    config,
    true // auto-connect when config is provided
  );

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setConfig(formData);
  };

  const handleDisconnect = async () => {
    await disconnect();
    setConfig(null);
  };

  // Show connection form if not connected
  if (!config || connectionState === 'disconnected') {
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#1e1e1e', 
        color: '#fff',
        minHeight: '100vh'
      }}>
        <h1>Connect to Neo4j</h1>
        <form onSubmit={handleConnect} style={{ maxWidth: '400px' }}>
          <div style={{ marginBottom: '10px' }}>
            <label>URI:</label>
            <input
              type="text"
              value={formData.uri}
              onChange={(e) => setFormData({ ...formData, uri: e.target.value })}
              style={{ width: '100%', padding: '5px', marginTop: '5px' }}
              placeholder="bolt://localhost:7687"
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Username:</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={{ width: '100%', padding: '5px', marginTop: '5px' }}
              placeholder="neo4j"
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Password:</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={{ width: '100%', padding: '5px', marginTop: '5px' }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Database (optional):</label>
            <input
              type="text"
              value={formData.database}
              onChange={(e) => setFormData({ ...formData, database: e.target.value })}
              style={{ width: '100%', padding: '5px', marginTop: '5px' }}
              placeholder="neo4j"
            />
          </div>
          <button type="submit" style={{ padding: '10px 20px', marginTop: '10px' }}>
            Connect
          </button>
        </form>
      </div>
    );
  }

  // Show loading state
  if (connectionState === 'connecting') {
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#1e1e1e', 
        color: '#fff',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>Connecting to Neo4j...</div>
      </div>
    );
  }

  // Show error state
  if (connectionState === 'error') {
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#1e1e1e', 
        color: '#fff',
        minHeight: '100vh'
      }}>
        <h1>Connection Error</h1>
        <p style={{ color: '#ff6b6b' }}>{error}</p>
        <button onClick={handleDisconnect} style={{ padding: '10px 20px', marginTop: '10px' }}>
          Back to Connection Form
        </button>
      </div>
    );
  }

  // Show graph viewer with controls
  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Control Panel */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        backgroundColor: 'rgba(30, 30, 30, 0.9)',
        padding: '10px',
        borderRadius: '5px',
        color: '#fff',
      }}>
        <div style={{ marginBottom: '10px' }}>
          <strong>Neo4j Connected</strong>
          <div style={{ fontSize: '0.8em', color: '#888' }}>
            {formData.uri} - {formData.database}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button onClick={refresh} style={{ padding: '5px 10px' }}>
            Refresh
          </button>
          <button onClick={handleDisconnect} style={{ padding: '5px 10px' }}>
            Disconnect
          </button>
        </div>
        {graphData && (
          <div style={{ marginTop: '10px', fontSize: '0.8em' }}>
            Nodes: {graphData.nodes.length} | Edges: {graphData.edges.length}
          </div>
        )}
      </div>

      {/* Graph Viewer */}
      {graphData && <GraphViewer graphData={graphData} />}
    </div>
  );
};
