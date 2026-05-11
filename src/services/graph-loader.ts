import fs from "fs";

import type { Graph } from "../models/graph";

export function loadGraph(filePath: string): Graph {
    console.info(`Loading graph from ${filePath}`);
    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const graph = JSON.parse(fileContent) as Graph;
        console.info(`Loaded graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
        return graph;
    } catch (error) {
        console.error(`Failed to load graph from ${filePath}`);
        throw error;
    }
}