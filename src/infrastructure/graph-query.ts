import type { Graph } from "../models/graph";
import type { GraphNode } from "../models/node/node-types";

// getRootNodes returns nodes that are a head/root of a route
export function getRootNodes(graph: Graph): GraphNode[] {
    console.info("Getting root nodes");
    const fromNodes = new Set<string>();
    const toNodes = new Set<string>();

    for (const edge of graph.edges) {
        fromNodes.add(edge.from);
        for (const destination of edge.to) {
            toNodes.add(destination);
        }
    }

    return graph.nodes.filter(
        (node) =>
            fromNodes.has(node.name) &&
            !toNodes.has(node.name)
    );
}