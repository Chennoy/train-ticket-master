import type { GraphNode } from "./node/node-types";
import { NodeKind } from "./node/node-types";
import type { GraphEdge, RawGraphEdge } from "./edge";
import { z } from "zod";

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

const queryBoolean = z.enum(["true", "false"]).transform((v) => v === "true");

export const GraphQuerySchema = z.object({
    sinkKind: z.enum(NodeKind).optional(),
    publicExposed: queryBoolean.optional(),
    vulnerable: queryBoolean.optional(),
})
.strict(); // Reject unknown params

export type GraphQuery = z.infer<typeof GraphQuerySchema>;