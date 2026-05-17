import type { GraphNode } from "./node-types";
import type { NodeFilter } from "./node-types";
import { hasVulnerabilities, isPublic } from "./node-attributes";

// filterNodes returns nodes that match the filter criteria
export function filterNodes(nodes: GraphNode[], filter: NodeFilter): GraphNode[] {
    return nodes.filter(node => 
        (filter.kind === undefined || node.kind === filter.kind) &&
        (filter.publicExposed === undefined || isPublic(node) === filter.publicExposed) &&
        (filter.vulnerable === undefined || hasVulnerabilities(node) === filter.vulnerable)
    );
}