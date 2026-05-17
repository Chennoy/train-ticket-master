import { describe, it, expect } from "vitest";
import { getAffectedGraph } from "./graph-query";
import type { Graph } from "../models/graph";
import type { GraphNode } from "../models/node/node-types";

/**
 * Helper function to quickly build a valid Graph object with pre-indexed maps
 */
function createTestGraph(
    nodeNames: string[], 
    edges: Array<{ from: string; to: string[] }>
): Graph {
    const downstreamAdjacencyMap = new Map<string, Set<string>>();
    const upstreamAdjacencyMap = new Map<string, Set<string>>();

    for (const edge of edges) {
        // Build downstream
        const down = downstreamAdjacencyMap.get(edge.from) ?? new Set<string>();
        edge.to.forEach(t => down.add(t));
        downstreamAdjacencyMap.set(edge.from, down);

        // Build upstream
        for (const target of edge.to) {
            const up = upstreamAdjacencyMap.get(target) ?? new Set<string>();
            up.add(edge.from);
            upstreamAdjacencyMap.set(target, up);
        }
    }

    return {
        // Safe typecast to satisfy structural interface constraints in tests
        nodes: nodeNames.map(name => ({ name, kind: "test" } as unknown as GraphNode)),
        edges,
        downstreamAdjacencyMap,
        upstreamAdjacencyMap
    };
}

describe("Graph Affected Routes Filter", () => {
    
    it("should correctly isolate a simple linear path upstream and downstream", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3", "isolatedNode"],
            [
                { from: "node2", to: ["node3"] },
                { from: "node1", to: ["node2"] }
            ]
        );

        // FIX: Extract the actual GraphNode object right out of your mock ecosystem!
        const seedNode = graph.nodes.find(n => n.name === "node2")!;
        const result = getAffectedGraph(graph, [seedNode]);

        expect(result.nodes.map(n => n.name)).toEqual(["node1", "node2", "node3"]);
        expect(result.edges).toEqual([
            { from: "node2", to: ["node3"] },
            { from: "node1", to: ["node2"] }
        ]);
    });

    it("should handle cycles perfectly without crashing into an infinite loop", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3"],
            [
                { from: "node1", to: ["node2"] },
                { from: "node2", to: ["node1", "node3"] }
            ]
        );

        const seedNode = graph.nodes.find(n => n.name === "node1")!;
        const result = getAffectedGraph(graph, [seedNode]);

        expect(result.nodes.map(n => n.name)).toContain("node3");
        expect(result.edges).toEqual([
            { from: "node1", to: ["node2"] },
            { from: "node2", to: ["node1", "node3"] }
        ]);
    });

    it("should filter out unvisited sibling branches that share a common source node", () => {
        const graph = createTestGraph(
            ["nodeA", "nodeB", "nodeC"],
            [
                { from: "nodeA", to: ["nodeB", "nodeC"] }
            ]
        );

        const seedNode = graph.nodes.find(n => n.name === "nodeB")!;
        const result = getAffectedGraph(graph, [seedNode]);

        expect(result.nodes.map(n => n.name)).toEqual(["nodeA", "nodeB"]);
        expect(result.edges).toEqual([
            { from: "nodeA", to: ["nodeB"] }
        ]);
    });

    it("should ignore parallel routes that don't intersect the seed footprint", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3", "node4"],
            [
                { from: "node3", to: ["node4"] },
                { from: "node4", to: ["node1"] },
                { from: "node1", to: ["node2"] },
                { from: "node2", to: ["node3"] }
            ]
        );

        const seedNode = graph.nodes.find(n => n.name === "node1")!;
        const result = getAffectedGraph(graph, [seedNode]);

        expect(result.nodes.map(n => n.name)).toEqual(["node1", "node2", "node3", "node4"]);
        expect(result.edges).toContainEqual({ from: "node1", to: ["node2"] });
        expect(result.edges).toContainEqual({ from: "node4", to: ["node1"] });
        expect(result.edges).toContainEqual({ from: "node3", to: ["node4"] });
    });
});

describe("Data Integrity & Structural Health", () => {

        it("should treat the input graph as completely immutable", () => {
            // Layout: node1 -> node2
            const graph = createTestGraph(
                ["node1", "node2"],
                [{ from: "node1", to: ["node2"] }]
            );

            // Freeze the original arrays to strictly catch any mutation attempts
            Object.freeze(graph.nodes);
            Object.freeze(graph.edges);
            graph.edges.forEach(e => Object.freeze(e));

            const seedNode = graph.nodes.find(n => n.name === "node1")!;
            
            // If the code tries to .push(), .pop(), or modify any properties in-place,
            // this execution will throw a runtime error in strict mode.
            expect(() => getAffectedGraph(graph, [seedNode])).not.toThrow();
        });

        it("should guarantee no dangling references (all edge nodes must exist in the nodes array)", () => {
            // Layout: node1 -> node2 -> node3, and an unrelated node4 -> node5
            const graph = createTestGraph(
                ["node1", "node2", "node3", "node4", "node5"],
                [
                    { from: "node1", to: ["node2"] },
                    { from: "node2", to: ["node3"] },
                    { from: "node4", to: ["node5"] }
                ]
            );

            const seedNode = graph.nodes.find(n => n.name === "node2")!;
            const result = getAffectedGraph(graph, [seedNode]);

            // Create a set of all valid node names present in the output
            const outputNodeNames = new Set(result.nodes.map(n => n.name));

            // Verify every single edge strictly points between nodes that actually exist in the output
            for (const edge of result.edges) {
                expect(outputNodeNames.has(edge.from)).toBe(true);
                for (const target of edge.to) {
                    expect(outputNodeNames.has(target)).toBe(true);
                }
            }
        });

        it("should ensure strict edge uniqueness with zero duplicate source entries", () => {
            // Layout: Complex intersecting cycle paths
            const graph = createTestGraph(
                ["node1", "node2", "node3"],
                [
                    { from: "node1", to: ["node2"] },
                    { from: "node2", to: ["node3"] },
                    { from: "node3", to: ["node1"] }
                ]
            );

            const seedNode = graph.nodes.find(n => n.name === "node2")!;
            const result = getAffectedGraph(graph, [seedNode]);

            // Collect all 'from' origins
            const origins = result.edges.map(e => e.from);
            const uniqueOrigins = new Set(origins);

            // The number of edges must match the number of unique origins.
            // If this fails, it means an origin node was duplicated across multiple edge objects!
            expect(origins.length).toEqual(uniqueOrigins.size);
        });

        it("should gracefully handle completely empty graphs or empty seed sets", () => {
            const emptyGraph = createTestGraph([], []);
            
            // 1. Testing an empty graph with no seeds
            const result1 = getAffectedGraph(emptyGraph, []);
            expect(result1.nodes).toEqual([]);
            expect(result1.edges).toEqual([]);

            // 2. Testing a populated graph with no seeds passed
            const graph = createTestGraph(["node1"], []);
            const result2 = getAffectedGraph(graph, []);
            expect(result2.nodes).toEqual([]);
            expect(result2.edges).toEqual([]);
        });

        it("should strictly exclude unrelated bypass routes that happen to connect affected nodes", () => {
            const graph = createTestGraph(
                ["node1", "node2", "node3", "node4"],
                [
                    { from: "node1", to: ["node2"] },
                    { from: "node2", to: ["node3"] },
                    { from: "node3", to: ["node4"] },
                    { from: "node1", to: ["node4"] } // The unrelated bypass route
                ]
            );

            const seedNode = graph.nodes.find(n => n.name === "node2")!;
            const result = getAffectedGraph(graph, [seedNode]);

            // Assert that all four nodes are found since they are legitimately affected
            expect(result.nodes.map(n => n.name)).toEqual(["node1", "node2", "node3", "node4"]);

            // Assert that the exact traversed steps are present
            expect(result.edges).toContainEqual({ from: "node1", to: ["node2"] });
            expect(result.edges).toContainEqual({ from: "node2", to: ["node3"] });
            expect(result.edges).toContainEqual({ from: "node3", to: ["node4"] });

            // CRITICAL SECURITY ASSERTION: The bypass edge must NOT be in the results
            const hasBypassEdge = result.edges.some(edge => edge.from === "node1" && edge.to.includes("node4"));
            expect(hasBypassEdge).toBe(false);
        });

        it("should unify overlapping edges into a single GraphEdge object if discovered by both upstream and downstream traces", () => {
            // Layout: node1 -> node2 -> node3
            // If we select node2 as our seed node:
            // - Downstream crawl discovers: node2 -> node3
            // - Upstream crawl discovers:   node1 -> node2
            // Now, if we add node1 as an explicit second seed node, the downstream crawl starting at node1 
            // will ALSO traverse and discover the edge: node1 -> node2.
            const graph = createTestGraph(
                ["node1", "node2", "node3"],
                [
                    { from: "node1", to: ["node2"] },
                    { from: "node2", to: ["node3"] }
                ]
            );

            const seedNode1 = graph.nodes.find(n => n.name === "node1")!;
            const seedNode2 = graph.nodes.find(n => n.name === "node2")!;
            
            // Pass both seeds to trigger the overlapping discovery of the node1 -> node2 link
            const result = getAffectedGraph(graph, [seedNode1, seedNode2]);

            // Filter to find how many times 'node1' appears as a 'from' origin
            const node1Edges = result.edges.filter(edge => edge.from === "node1");

            // CRITICAL DEDUPLICATION ASSERTION: 
            // There must be exactly ONE edge configuration object for 'node1'
            expect(node1Edges.length).toBe(1);
            
            // It must contain the correct target relationships
            expect(node1Edges[0]).toEqual({
                from: "node1",
                to: ["node2"]
            });
        });

        it("should include a seed node in the final graph even if it has no connections", () => {
            // Layout: node1 is completely isolated. node2 -> node3 is a separate component.
            const graph = createTestGraph(
                ["node1", "node2", "node3"],
                [{ from: "node2", to: ["node3"] }]
            );

            const seedNode = graph.nodes.find(n => n.name === "node1")!;
            const result = getAffectedGraph(graph, [seedNode]);

            // The isolated node must be present in the nodes array
            expect(result.nodes.map(n => n.name)).toEqual(["node1"]);
            
            // The edges array must be completely empty since node1 has no relations
            expect(result.edges).toEqual([]);
        });
    });