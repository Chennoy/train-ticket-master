import type { GraphNode, NodeFilter } from "./node-types";
import { isPublic } from "./node-attributes";

// filterNodes returns nodes that match the filter criteria
export function filterNodes(nodes: GraphNode[], filter: NodeFilter): GraphNode[] {
    return nodes.filter((node) => {
        if (filter.kind !== undefined && node.kind !== filter.kind) {
            return false;
        }
        if (filter.publicExposed !== undefined && !isPublic(node)) {
            return false;
        }
        return true;
    });
}