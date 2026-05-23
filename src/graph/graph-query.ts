import type { Graph, RawGraph, GraphQuery } from "../models/graph";
import type { GraphEdge } from "../models/edge";
import type { GraphNode } from "../models/node/node-types";
import { filterRegistry } from "./filters/filter-registry";
import type { FilterScope } from "./filters/filter-types";

// getRootNodes returns nodes that are a head/root of a route
export function getRootNodes(graph: Graph): GraphNode[] {
    console.info("Getting root nodes");
    const toNodes = new Set<string>();

    for (const edge of graph.edges) {
        for (const destination of edge.to) {
            toNodes.add(destination);
        }
    }

    // A root never appears as another node's destination
    return graph.nodes.filter(node => !toNodes.has(node.name));
}

// getTailNodes returns nodes that are an end/tail of a route
export function getTailNodes(graph: Graph): GraphNode[] {
    console.info("Getting tail nodes");
    const fromNodes = new Set(graph.edges.map(e => e.from));

    // A tail never appears as an edge origin
    return graph.nodes.filter(node => !fromNodes.has(node.name));
}

// candidatesForScope maps a filter's scope to the nodes list that should be explored in that scope
function candidatesForScope(graph: Graph, scope: FilterScope): GraphNode[] {
    switch (scope) {
        case "start":
            return getRootNodes(graph);
        case "end":
            return getTailNodes(graph);
        case "any":
            return graph.nodes;
    }
}

// scopeToDirection maps a filter's scope to the trace directions used to explore affected nodes
function scopeToDirection(scope: FilterScope): ("upstream" | "downstream")[] {
    switch (scope) {
        case "start":
            return ["downstream"];
        case "end":
            return ["upstream"];
        case "any":
            return ["downstream", "upstream"];
    }
}

/**
 * traceRouteDirection tracks and collects the exact nodes and
 * edges traversed in a single direction from the given seed nodes.
 *
 * When allowedNodes is set, the exploration is limited to that set, and neighbors
 * outside it are skipped.
 */
function traceRouteDirection(
    seedNodes: GraphNode[],
    graph: Graph,
    direction: "upstream" | "downstream",
    allowedNodes?: Set<string>
): { nodes: Set<string>; edges: GraphEdge[] } {
    const validSeeds = allowedNodes
        ? seedNodes.filter(n => allowedNodes.has(n.name))
        : seedNodes;

    const visitedNodes = new Set<string>(validSeeds.map(node => node.name));
    const queue = [...visitedNodes];

    // Accumulates discovered edges as from -> Set<to>, merging duplicate targets.
    const edgeTrackingMap = new Map<string, Set<string>>();

    const adjacencyMap =
        direction === "downstream"
            ? graph.downstreamAdjacencyMap
            : graph.upstreamAdjacencyMap;

    while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacencyMap.get(current);
        if (!neighbors) continue;

        for (const neighbor of neighbors) {
            if (allowedNodes && !allowedNodes.has(neighbor)) {
                continue;
            }

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
        finalizedEdges.push({ from, to: Array.from(toSet) });
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

    const filteredEdges: GraphEdge[] = Array.from(edgeAggregationMap.entries()).map(
        ([from, toSet]) => ({ from, to: Array.from(toSet) })
    );

    return {
        nodes: graph.nodes.filter(node => affectedNodeNames.has(node.name)),
        edges: filteredEdges,
        downstreamAdjacencyMap: graph.downstreamAdjacencyMap,
        upstreamAdjacencyMap: graph.upstreamAdjacencyMap
    };
}

/**
 * applyFilterTrack runs one filter pass. It finds candidate nodes that match the
 * predicate AND are allowed. Then traces from those matches in the given direction(s).
 * Finally, returns the set of nodes reached (this becomes the new allowed set).
 * Returns null when no candidates match, signalling queryGraph to return an empty result
 */
function applyFilterTrack(
    graph: Graph,
    candidateNodes: GraphNode[],
    matches: (n: GraphNode) => boolean,
    traceDirections: ("upstream" | "downstream")[],
    currentAllowedNodes: Set<string>
): Set<string> | null {
    const matchedNodes = candidateNodes.filter(n => currentAllowedNodes.has(n.name) && matches(n));
    if (matchedNodes.length === 0) {
        return null;
    }

    // Union across directions
    let resultingNodes = new Set<string>();
    for (const direction of traceDirections) {
        const trace = traceRouteDirection(matchedNodes, graph, direction, currentAllowedNodes);
        resultingNodes = resultingNodes.union(trace.nodes);
    }

    return resultingNodes.size > 0 ? resultingNodes : null;
}

// filterEdgesByAllowedNodes rebuilds the edges array, keeping only edges whose endpoints are both in the allowed set
function filterEdgesByAllowedNodes(edges: GraphEdge[], allowedNodes: Set<string>): GraphEdge[] {
    const finalEdges: GraphEdge[] = [];
    for (const edge of edges) {
        if (allowedNodes.has(edge.from)) {
            const validTargets = edge.to.filter(target => allowedNodes.has(target));
            if (validTargets.length > 0) {
                finalEdges.push({ from: edge.from, to: validTargets });
            }
        }
    }
    return finalEdges;
}

// queryGraph returns a filtered graph based on the given query
export function queryGraph(graph: Graph, query: GraphQuery): RawGraph {
    if (Object.keys(query).length === 0) {
        return graph;
    }

    // Start with every node allowed; each filter pass narrows the allowed set to apply an AND logic
    let currentAllowedNodes = new Set<string>(graph.nodes.map(n => n.name));

    for (const [key, def] of Object.entries(filterRegistry)) {
        const rawValue = (query as Record<string, unknown>)[key];
        if (rawValue === undefined) { 
            continue 
        };

        const candidates = candidatesForScope(graph, def.scope);
        const directions = scopeToDirection(def.scope);
        const matches = (n: GraphNode) => def.predicate(n, rawValue);

        const result = applyFilterTrack(graph, candidates, matches, directions, currentAllowedNodes);
        if (!result) {
            // No nodes satisfy the filter
            return { nodes: [], edges: [] };
        }

        // Narrow the allowed nodes based on the filter
        currentAllowedNodes = result;
    }

    return {
        nodes: graph.nodes.filter(node => currentAllowedNodes.has(node.name)),
        edges: filterEdgesByAllowedNodes(graph.edges, currentAllowedNodes),
    };
}