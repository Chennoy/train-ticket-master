import type { GraphNode, NodeKind } from "./node/node-types";
import type { GraphEdge, RawGraphEdge } from "./edge";

export type Graph = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    downstreamAdjacencyMap: Map<string, Set<string>>
    upstreamAdjacencyMap: Map<string, Set<string>>
};

export type RawGraph = {
    nodes: GraphNode[];
    edges: RawGraphEdge[];
};

export type GraphQuery = {
    sinkKind?: NodeKind;
    publicExposed?: boolean;
    vulnerable?: boolean;
}