import type { GraphNode } from "./node";
import type { GraphEdge } from "./edge";

export type Graph = {
    nodes: GraphNode[];
    edges: GraphEdge[];
};