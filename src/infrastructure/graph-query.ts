import type { Graph } from "../models/graph";
import type { GraphEdge } from "../models/edge";
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

/**
 * traceRouteDirection tracks and collects the exact nodes and
 * edges traversed in a single direction from the given seed nodes
 */
function traceRouteDirection(
    seedNodes: GraphNode[],
    graph: Graph,
    direction: "upstream" | "downstream"
): { nodes: Set<string>; edges: GraphEdge[] } {
    const visitedNodes = new Set<string>(seedNodes.map(node => node.name));
    const queue = [...visitedNodes];
    const edgeTrackingMap = new Map<string, Set<string>>(); // Map for constructing edges from found connections
    const adjacencyMap = direction === "downstream" ? graph.downstreamAdjacencyMap : graph.upstreamAdjacencyMap;

    while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacencyMap.get(current);
        if (!neighbors) continue;

        for (const neighbor of neighbors) {
            // Fix the direction of the edge to always keep a downstream direction
            const fromNode = direction === "downstream" ? current : neighbor;
            const toNode = direction === "downstream" ? neighbor : current;

            // Append the destination to its originating 'from' key
            const existingTargets = edgeTrackingMap.get(fromNode) ?? new Set<string>();
            existingTargets.add(toNode);
            edgeTrackingMap.set(fromNode, existingTargets);

            // Only queue up the neighbor if we haven't explored its outgoing branches yet
            if (!visitedNodes.has(neighbor)) {
                visitedNodes.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    // Convert our internal map directly into the standard GraphEdge[] format
    const finalizedEdges: GraphEdge[] = [];
    for (const [from, toSet] of edgeTrackingMap.entries()) {
        finalizedEdges.push({
            from,
            to: Array.from(toSet)
        });
    }

    return { nodes: visitedNodes, edges: finalizedEdges };
}

// getAffectedGraph returns a filtered graph of routes passing through seed nodes
export function getAffectedGraph(graph: Graph, seedNodes: GraphNode[]): Graph {
    console.info(`Calculating affected routes for ${seedNodes.length} seed nodes`);

    const downstreamResult = traceRouteDirection(seedNodes, graph, "downstream");
    const upstreamResult = traceRouteDirection(seedNodes, graph, "upstream");

    const affectedNodeNames = downstreamResult.nodes.union(upstreamResult.nodes);

    // Combine edges and deduplicate multi-destination sets if they overlap across traces
    const edgeAggregationMap = new Map<string, Set<string>>();
    const allDiscoveredEdges = [...downstreamResult.edges, ...upstreamResult.edges];

    for (const edge of allDiscoveredEdges) {
        const existing = edgeAggregationMap.get(edge.from) ?? new Set<string>();
        edge.to.forEach(target => existing.add(target));
        edgeAggregationMap.set(edge.from, existing);
    }

    const filteredEdges: GraphEdge[] = Array.from(edgeAggregationMap.entries()).map(([from, toSet]) => ({
        from,
        to: Array.from(toSet)
    }));

    return {
        nodes: graph.nodes.filter(node => affectedNodeNames.has(node.name)),
        edges: filteredEdges,
        downstreamAdjacencyMap: graph.downstreamAdjacencyMap,
        upstreamAdjacencyMap: graph.upstreamAdjacencyMap
    };
}