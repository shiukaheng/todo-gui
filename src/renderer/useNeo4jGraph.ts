import { useState, useEffect, useRef } from 'react';
import { 
  Neo4jGraphClient, 
  Neo4jConnectionConfig, 
  Neo4jGraphState,
  ConnectionState 
} from './Neo4jGraphClient';
import { GraphData } from '../types/GraphData';

export interface UseNeo4jGraphResult {
  connectionState: ConnectionState;
  graphData: GraphData | null;
  error: string | null;
  refresh: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * React hook for Neo4j graph connection
 * 
 * Manages the lifecycle of a Neo4j connection, automatically connecting on mount
 * and disconnecting on unmount. Provides reactive state updates for connection
 * status and graph data.
 * 
 * @param config Neo4j connection configuration
 * @param autoConnect Whether to automatically connect on mount (default: true)
 * @returns Neo4j graph state and control methods
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { connectionState, graphData, error, refresh } = useNeo4jGraph({
 *     uri: 'bolt://localhost:7687',
 *     username: 'neo4j',
 *     password: 'password',
 *   });
 * 
 *   if (connectionState === 'connecting') return <div>Connecting...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   if (!graphData) return <div>No data</div>;
 * 
 *   return <GraphViewer data={graphData} />;
 * }
 * ```
 */
export function useNeo4jGraph(
  config: Neo4jConnectionConfig | null,
  autoConnect: boolean = true
): UseNeo4jGraphResult {
  const [state, setState] = useState<Neo4jGraphState>({
    connectionState: 'disconnected',
    graphData: null,
    error: null,
  });

  const clientRef = useRef<Neo4jGraphClient | null>(null);

  useEffect(() => {
    // Don't connect if no config or autoConnect is false
    if (!config || !autoConnect) {
      return;
    }

    // Create client instance
    const client = new Neo4jGraphClient();
    clientRef.current = client;

    // Connect to Neo4j
    const connectAsync = async () => {
      try {
        await client.connect(config, (newState) => {
          setState(newState);
        });
      } catch (error) {
        // Error is already handled in the client and callback is called
        console.error('Failed to connect to Neo4j:', error);
      }
    };

    connectAsync();

    // Cleanup function - disconnect on unmount
    return () => {
      const disconnectAsync = async () => {
        if (clientRef.current) {
          try {
            await clientRef.current.disconnect();
          } catch (error) {
            console.error('Error during disconnect:', error);
          }
          clientRef.current = null;
        }
      };

      disconnectAsync();
    };
  }, [config, autoConnect]);

  // Refresh method
  const refresh = async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.refresh();
      } catch (error) {
        console.error('Failed to refresh graph:', error);
      }
    }
  };

  // Disconnect method
  const disconnect = async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
      } catch (error) {
        console.error('Failed to disconnect:', error);
      }
    }
  };

  return {
    connectionState: state.connectionState,
    graphData: state.graphData,
    error: state.error,
    refresh,
    disconnect,
  };
}
