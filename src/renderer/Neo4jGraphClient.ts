import neo4j, { Driver, Session } from 'neo4j-driver';
import { GraphData, GraphNode, GraphEdge } from '../types/GraphData';

export type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'error';

export interface Neo4jConnectionConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export interface Neo4jGraphState {
  connectionState: ConnectionState;
  graphData: GraphData | null;
  error: string | null;
}

export type Neo4jGraphCallback = (state: Neo4jGraphState) => void;

/**
 * Neo4j Graph Client
 * 
 * Manages connection to Neo4j database and provides live updates of the graph state.
 * Supports callback-based updates for connection state and graph data.
 */
export class Neo4jGraphClient {
  private driver: Driver | null = null;
  private session: Session | null = null;
  private config: Neo4jConnectionConfig | null = null;
  private callback: Neo4jGraphCallback | null = null;
  
  private state: Neo4jGraphState = {
    connectionState: 'disconnected',
    graphData: null,
    error: null,
  };

  /**
   * Connect to Neo4j database
   * @param config Connection configuration
   * @param callback Callback function that receives state updates
   */
  async connect(
    config: Neo4jConnectionConfig, 
    callback: Neo4jGraphCallback
  ): Promise<void> {
    this.config = config;
    this.callback = callback;

    this.updateState({
      connectionState: 'connecting',
      graphData: null,
      error: null,
    });

    try {
      // Create driver
      this.driver = neo4j.driver(
        config.uri,
        neo4j.auth.basic(config.username, config.password)
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();

      // Create session
      this.session = this.driver.session({
        database: config.database || 'neo4j',
      });

      this.updateState({
        connectionState: 'connected',
        graphData: null,
        error: null,
      });

      // Fetch initial graph data
      await this.fetchGraph();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateState({
        connectionState: 'error',
        graphData: this.state.graphData, // Preserve existing graph data
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Fetch the entire graph from Neo4j
   * This is a simple implementation that fetches all nodes and relationships.
   * You can customize the Cypher query based on your needs.
   */
  async fetchGraph(): Promise<void> {
    if (!this.session || this.state.connectionState !== 'connected') {
      throw new Error('Not connected to Neo4j');
    }

    try {
      // Query all nodes and relationships with calculated properties
      // calculated_due: minimum due date from self and all ancestors
      // calculated_completed: based on node's completion status and all children
      const result = await this.session.run(`
        MATCH (n)
        OPTIONAL MATCH (n)-[r]->(m)
        
        // Collect all ancestors via DEPENDS_ON relationships to calculate minimum due
        OPTIONAL MATCH ancestorPath = (ancestor)-[:DEPENDS_ON*]->(n)
        WITH n, r, m,
             collect(DISTINCT ancestor) AS ancestors
        
        // Calculate minimum due date from self and ancestors
        WITH n, r, m,
             REDUCE(minDue = n.due, node IN ancestors | 
               CASE 
                 WHEN node.due IS NOT NULL AND (minDue IS NULL OR node.due < minDue) 
                 THEN node.due
                 ELSE minDue
               END
             ) AS calculated_due
        
        // Collect all children (nodes that n depends on)
        OPTIONAL MATCH (n)-[:DEPENDS_ON]->(child)
        WITH n, r, m, calculated_due,
             collect(child) AS children
        
        // Calculate completion status
        WITH n, r, m, calculated_due,
             CASE
               WHEN size(children) = 0 THEN 
                 // No children - use own completion status (true if inferred, else use completed flag)
                 CASE WHEN COALESCE(n.inferred, false) = true THEN true ELSE COALESCE(n.completed, false) END
               ELSE
                 // Has children - check based on inferred flag
                 CASE 
                   WHEN COALESCE(n.inferred, false) = true THEN 
                     // Inferred nodes: all children must be completed
                     all(c IN children WHERE COALESCE(c.completed, false) = true)
                   ELSE
                     // Non-inferred: self.completed AND all children completed
                     COALESCE(n.completed, false) AND all(c IN children WHERE COALESCE(c.completed, false) = true)
                 END
             END AS calculated_completed
        
        RETURN 
          n {.*, identity: id(n), labels: labels(n), calculated_due: calculated_due, calculated_completed: calculated_completed} AS n,
          r, 
          m {.*, identity: id(m), labels: labels(m)} AS m
        
        UNION ALL
        
        // Virtual root node for orphans
        MATCH (orphan)
        WHERE NOT EXISTS((orphan)<-[:DEPENDS_ON]-())
        
        // Calculate properties for orphan nodes
        OPTIONAL MATCH (orphan)-[:DEPENDS_ON]->(child)
        WITH orphan,
             collect(child) AS children
        
        WITH orphan, children,
             COALESCE(orphan.due, null) AS calculated_due,
             CASE
               WHEN size(children) = 0 THEN 
                 CASE WHEN COALESCE(orphan.inferred, false) = true THEN true ELSE COALESCE(orphan.completed, false) END
               ELSE
                 CASE 
                   WHEN COALESCE(orphan.inferred, false) = true THEN 
                     all(c IN children WHERE COALESCE(c.completed, false) = true)
                   ELSE
                     COALESCE(orphan.completed, false) AND all(c IN children WHERE COALESCE(c.completed, false) = true)
                 END
             END AS calculated_completed
        
        RETURN 
          {identity: 'root', labels: ['Root'], properties: {id: 'root'}} AS n,
          {identity: 'root-to-' + toString(id(orphan)), type: 'ROOT_PARENT', properties: {}} AS r,
          orphan {.*, identity: id(orphan), labels: labels(orphan), calculated_due: calculated_due, calculated_completed: calculated_completed} AS m
      `);

      // Process results into GraphData format
      const nodesMap = new Map<string, GraphNode>();
      const edges: GraphEdge[] = [];

      result.records.forEach(record => {
        // Process source node - now a map projection with identity as a property
        const sourceNode = record.get('n');
        if (sourceNode) {
          // Identity is now a direct property from the map projection
          const nodeId = typeof sourceNode.identity === 'object' 
            ? sourceNode.identity.toString() 
            : String(sourceNode.identity);
          
          if (!nodesMap.has(nodeId)) {
            nodesMap.set(nodeId, {
              id: nodeId,
              data: {
                labels: sourceNode.labels,
                ...sourceNode, // Flatten all properties including calculated ones
              }
            });
          }
        }

        // Process relationship and target node
        const relationship = record.get('r');
        const targetNode = record.get('m');
        
        if (relationship && targetNode) {
          const targetId = typeof targetNode.identity === 'object'
            ? targetNode.identity.toString()
            : String(targetNode.identity);
          
          // Add target node if not exists
          if (!nodesMap.has(targetId)) {
            nodesMap.set(targetId, {
              id: targetId,
              data: {
                labels: targetNode.labels,
                ...targetNode, // Flatten all properties including calculated ones
              }
            });
          }

          // Add edge with all relationship data
          const edgeId = typeof relationship.identity === 'object'
            ? relationship.identity.toString()
            : String(relationship.identity);
            
          edges.push({
            id: edgeId,
            source: typeof sourceNode.identity === 'object'
              ? sourceNode.identity.toString()
              : String(sourceNode.identity),
            target: targetId,
            data: {
              type: relationship.type,
              ...relationship.properties, // Flatten properties
            }
          });
        }
      });

      const graphData: GraphData = {
        nodes: Array.from(nodesMap.values()),
        edges,
      };

      this.updateState({
        ...this.state,
        graphData,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateState({
        connectionState: 'error',
        graphData: this.state.graphData, // Keep existing data
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Refresh the graph data from Neo4j
   */
  async refresh(): Promise<void> {
    await this.fetchGraph();
  }

  /**
   * Disconnect from Neo4j
   */
  async disconnect(): Promise<void> {
    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }

      if (this.driver) {
        await this.driver.close();
        this.driver = null;
      }

      this.updateState({
        connectionState: 'disconnected',
        graphData: null,
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateState({
        connectionState: 'error',
        graphData: this.state.graphData,
        error: errorMessage,
      });
    }
  }

  /**
   * Get current state
   */
  getState(): Neo4jGraphState {
    return { ...this.state };
  }

  /**
   * Update internal state and notify callback
   */
  private updateState(newState: Neo4jGraphState): void {
    this.state = newState;
    if (this.callback) {
      this.callback(newState);
    }
  }
}
