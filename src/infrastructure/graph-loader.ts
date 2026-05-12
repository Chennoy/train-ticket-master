import fs from "fs";

import type { Graph, RawGraph } from "../models/graph";
import type { GraphEdge } from "../models/edge";

export function loadGraph(filePath: string): Graph {
    console.info(`Loading graph from ${filePath}`);
    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const rawGraph = JSON.parse(fileContent) as RawGraph;
        const graph: Graph = {
            nodes: rawGraph.nodes,
            edges: normalizeEdges(rawGraph.edges),
        };
        console.info(`Loaded graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
        return graph;
    } catch (error) {
        console.error(`Failed to load graph from ${filePath}`);
        throw error;
    }
}

function normalizeEdges(edges: RawGraph["edges"]): GraphEdge[] {
    return edges.map((edge) => ({
        from: edge.from,
        to: Array.isArray(edge.to) ? edge.to : [edge.to],
    }));
}