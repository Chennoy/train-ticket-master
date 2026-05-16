import type { GraphNode } from "./node-types";


export function isPublic(node: GraphNode): boolean {
    return node.publicExposed === true;
}

export function hasVulnerabilities(node: GraphNode): boolean {
    return (
        node.vulnerabilities !== undefined &&
        node.vulnerabilities?.length > 0
    );
}