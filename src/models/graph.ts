import type { GraphNode } from "./node";
import type { GraphEdge, RawGraphEdge } from "./edge";

export type Graph = {
    nodes: GraphNode[];
    edges: GraphEdge[];
};

export type RawGraph = {
    nodes: GraphNode[];
    edges: RawGraphEdge[];
};