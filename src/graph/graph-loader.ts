import fs from "fs";

import type { Graph, RawGraph } from "../models/graph";
import type { GraphEdge } from "../models/edge";

// loadGraph loads a graph from a JSON file
export function loadGraph(filePath: string): Graph {
    console.info(`Loading graph from ${filePath}`);
    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const rawGraph = JSON.parse(fileContent) as RawGraph;
        const edges = normalizeEdges(rawGraph.edges);

        const graph: Graph = {
            nodes: rawGraph.nodes,
            edges,
            downstreamAdjacencyMap: buildDownstreamMap(edges),
            upstreamAdjacencyMap: buildUpstreamMap(edges),
        };

        console.info(`Loaded graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
        return graph;
    } catch (error) {
        console.error(`Failed to load graph from ${filePath}`);
        throw error;
    }
}

// normalizeEdges normalizes raw edges to the GraphEdge format
function normalizeEdges(edges: RawGraph["edges"]): GraphEdge[] {
    return edges.map((edge) => ({
        from: edge.from,
        to: Array.isArray(edge.to) ? edge.to : [edge.to],
    }));
}

// buildDownstreamMap builds a map of nodes and a set of nodes they can invoke
function buildDownstreamMap(edges: GraphEdge[]): Map<string, Set<string>> {
    const downstream = new Map<string, Set<string>>();
    for (const edge of edges) {
        const existing = downstream.get(edge.from);
        if (existing) {
            // Combine the existing set with the new set to avoid overwriting
            downstream.set(edge.from, existing.union(new Set(edge.to)));
        } else {
            downstream.set(edge.from, new Set(edge.to));
        }
    }
    return downstream;
}

// buildUpstreamMap builds a map of nodes and a set of nodes that can invoke them
function buildUpstreamMap(edges: GraphEdge[]): Map<string, Set<string>> {
    const upstream = new Map<string, Set<string>>();
    for (const edge of edges) {
        for (const destination of edge.to) {
            // Check if the destination exists in the map and initialize if not
            const existing = upstream.get(destination) ?? new Set<string>();
            // Add edge.from as a caller
            existing.add(edge.from);
            // Update the map
            upstream.set(destination, existing);
        }
    }
    return upstream;
}