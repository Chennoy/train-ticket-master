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

// getTailNodes returns nodes that are an end/tail of a route
export function getTailNodes(graph: Graph): GraphNode[] {
    console.info("Getting tail nodes");
    const fromNodes = new Set(graph.edges.map(e => e.from));
    
    // A tail is any node that doesn't originate an edge
    return graph.nodes.filter(node => !fromNodes.has(node.name));
}