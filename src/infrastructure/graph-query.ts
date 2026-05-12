import type { Graph } from "../models/graph";
import type { GraphNode } from "../models/node/node-types";

// getRootNodes returns nodes that are a head/root of a route
export function getRootNodes(graph: Graph): GraphNode[] {
    console.info("Getting root nodes");
    const toNodes = new Set<string>();
    
    for (const edge of graph.edges) {
        for (const destination of edge.to) {
            toNodes.add(destination);
        }
    }

    return graph.nodes.filter(node => !toNodes.has(node.name));
}