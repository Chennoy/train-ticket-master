import { describe, it, expect } from "vitest";
import { queryGraph } from "./graph-query";
import type { Graph } from "../models/graph";
import type { GraphNode } from "../models/node/node-types";

/**
 * Builds a Graph with pre-indexed adjacency maps from a node-name list and
 * edge list. Nodes default to kind "test"; mutate them with the helpers below
 * to make them match filters.
 */
function createTestGraph(
    nodeNames: string[],
    edges: Array<{ from: string; to: string[] }>
): Graph {
    const downstreamAdjacencyMap = new Map<string, Set<string>>();
    const upstreamAdjacencyMap = new Map<string, Set<string>>();

    for (const edge of edges) {
        const down = downstreamAdjacencyMap.get(edge.from) ?? new Set<string>();
        edge.to.forEach(t => down.add(t));
        downstreamAdjacencyMap.set(edge.from, down);

        for (const target of edge.to) {
            const up = upstreamAdjacencyMap.get(target) ?? new Set<string>();
            up.add(edge.from);
            upstreamAdjacencyMap.set(target, up);
        }
    }

    return {
        nodes: nodeNames.map(name => ({ name, kind: "test" } as unknown as GraphNode)),
        edges,
        downstreamAdjacencyMap,
        upstreamAdjacencyMap
    };
}

/** Marks named nodes as vulnerable so { vulnerable: true } seeds traces from them. */
function markVulnerable(graph: Graph, ...names: string[]): void {
    for (const name of names) {
        const node = graph.nodes.find(n => n.name === name)!;
        (node as any).vulnerabilities = [{ severity: "high" }];
    }
}

/**
 * Linear fixture for API-layer filter tests:
 * rootPublic (public) -> internalNode -> vulnerableNode (vuln) -> tailRDS (kind=rds)
 */
function createMockQueryGraph(): Graph {
    const graph = createTestGraph(
        ["rootPublic", "internalNode", "vulnerableNode", "tailRDS"],
        [
            { from: "rootPublic", to: ["internalNode"] },
            { from: "internalNode", to: ["vulnerableNode"] },
            { from: "vulnerableNode", to: ["tailRDS"] }
        ]
    );

    Object.assign(graph.nodes[0] as any, { kind: "service", publicExposed: true });
    Object.assign(graph.nodes[1] as any, { kind: "service", publicExposed: false });
    Object.assign(graph.nodes[2] as any, {
        kind: "service",
        publicExposed: false,
        vulnerabilities: [{ severity: "high" }]
    });
    Object.assign(graph.nodes[3] as any, { kind: "rds", publicExposed: false });

    return graph;
}

/** Assert result node names regardless of order. */
function expectNodes(result: { nodes: GraphNode[] }, ...names: string[]): void {
    expect(result.nodes.map(n => n.name).sort()).toEqual([...names].sort());
}

/**
 * Extended fixture with two roots and two sinks:
 *
 *   publicRoot (public)  -> mid -> vulnNode (vuln) -> rdsTail (rds)
 *   privateRoot (private)-> sideMid ----------------> sqsTail (sqs)
 */
function createExtendedFilterGraph(): Graph {
    const graph = createTestGraph(
        ["publicRoot", "privateRoot", "mid", "sideMid", "vulnNode", "rdsTail", "sqsTail"],
        [
            { from: "publicRoot", to: ["mid"] },
            { from: "mid", to: ["vulnNode"] },
            { from: "vulnNode", to: ["rdsTail"] },
            { from: "privateRoot", to: ["sideMid"] },
            { from: "sideMid", to: ["sqsTail"] }
        ]
    );

    Object.assign(graph.nodes.find(n => n.name === "publicRoot")!, {
        kind: "service", publicExposed: true
    });
    Object.assign(graph.nodes.find(n => n.name === "privateRoot")!, {
        kind: "service", publicExposed: false
    });
    for (const name of ["mid", "sideMid"]) {
        Object.assign(graph.nodes.find(n => n.name === name)!, { kind: "service", publicExposed: false });
    }
    Object.assign(graph.nodes.find(n => n.name === "vulnNode")!, {
        kind: "service",
        publicExposed: false,
        vulnerabilities: [{ severity: "high" }]
    });
    Object.assign(graph.nodes.find(n => n.name === "rdsTail")!, { kind: "rds", publicExposed: false });
    Object.assign(graph.nodes.find(n => n.name === "sqsTail")!, { kind: "sqs", publicExposed: false });

    return graph;
}

describe("queryGraph - empty query fast path", () => {
    it("returns the original graph by reference when no filters are provided", () => {
        const graph = createMockQueryGraph();

        const result = queryGraph(graph, {});

        expect(result).toBe(graph);
        expect(result.nodes.length).toBe(4);
    });
});

describe("queryGraph - compound filters (AND)", () => {
    it("returns an empty graph when a later filter has no match within the prior allowed set", () => {
        // Vulnerable node sits on an internal-only branch; no public route reaches it.
        const graph = createTestGraph(
            ["publicRoot", "internalRoot", "internalNode", "vulnerableNode"],
            [
                { from: "publicRoot", to: ["internalNode"] },
                { from: "internalRoot", to: ["vulnerableNode"] }
            ]
        );
        Object.assign(graph.nodes[0] as any, { publicExposed: true });
        markVulnerable(graph, "vulnerableNode");

        const result = queryGraph(graph, { publicExposed: true, vulnerable: true });

        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
    });
});

describe("queryGraph - route tracing semantics", () => {
    it("includes nodes both upstream and downstream of a matching node", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3", "isolatedNode"],
            [
                { from: "node2", to: ["node3"] },
                { from: "node1", to: ["node2"] }
            ]
        );
        markVulnerable(graph, "node2");

        const result = queryGraph(graph, { vulnerable: true });

        expect(result.nodes.map(n => n.name).sort()).toEqual(["node1", "node2", "node3"]);
        expect(result.edges).toEqual([
            { from: "node2", to: ["node3"] },
            { from: "node1", to: ["node2"] }
        ]);
    });

    it("handles cycles without looping infinitely", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3"],
            [
                { from: "node1", to: ["node2"] },
                { from: "node2", to: ["node1", "node3"] }
            ]
        );
        markVulnerable(graph, "node1");

        const result = queryGraph(graph, { vulnerable: true });

        expect(result.nodes.map(n => n.name).sort()).toEqual(["node1", "node2", "node3"]);
    });

    it("excludes sibling branches that do not connect through the matching node", () => {
        const graph = createTestGraph(
            ["nodeA", "nodeB", "nodeC"],
            [{ from: "nodeA", to: ["nodeB", "nodeC"] }]
        );
        markVulnerable(graph, "nodeB");

        const result = queryGraph(graph, { vulnerable: true });

        expect(result.nodes.map(n => n.name).sort()).toEqual(["nodeA", "nodeB"]);
        expect(result.edges).toEqual([{ from: "nodeA", to: ["nodeB"] }]);
    });

    it("traces around a cycle that loops back to the matching node", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3", "node4"],
            [
                { from: "node1", to: ["node2"] },
                { from: "node2", to: ["node3"] },
                { from: "node3", to: ["node4"] },
                { from: "node4", to: ["node1"] }
            ]
        );
        markVulnerable(graph, "node1");

        const result = queryGraph(graph, { vulnerable: true });

        expect(result.nodes.map(n => n.name).sort()).toEqual(["node1", "node2", "node3", "node4"]);
        expect(result.edges).toContainEqual({ from: "node1", to: ["node2"] });
        expect(result.edges).toContainEqual({ from: "node3", to: ["node4"] });
        expect(result.edges).toContainEqual({ from: "node4", to: ["node1"] });
    });
});

describe("queryGraph - data integrity", () => {
    it("does not mutate the input graph", () => {
        const graph = createTestGraph(
            ["node1", "node2"],
            [{ from: "node1", to: ["node2"] }]
        );
        markVulnerable(graph, "node1");
        Object.freeze(graph.nodes);
        Object.freeze(graph.edges);
        graph.edges.forEach(e => Object.freeze(e));

        expect(() => queryGraph(graph, { vulnerable: true })).not.toThrow();
    });

    it("never returns edges that reference nodes outside the result nodes array", () => {
        // Two disconnected components; matching node2 keeps only the first.
        const graph = createTestGraph(
            ["node1", "node2", "node3", "node4", "node5"],
            [
                { from: "node1", to: ["node2"] },
                { from: "node2", to: ["node3"] },
                { from: "node4", to: ["node5"] }
            ]
        );
        markVulnerable(graph, "node2");

        const result = queryGraph(graph, { vulnerable: true });

        const allowed = new Set(result.nodes.map(n => n.name));
        for (const edge of result.edges) {
            expect(allowed.has(edge.from)).toBe(true);
            for (const target of edge.to) {
                expect(allowed.has(target)).toBe(true);
            }
        }
    });

    it("does not duplicate edge origins in the result", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3"],
            [
                { from: "node1", to: ["node2"] },
                { from: "node2", to: ["node3"] },
                { from: "node3", to: ["node1"] }
            ]
        );
        markVulnerable(graph, "node2");

        const result = queryGraph(graph, { vulnerable: true });

        const origins = result.edges.map(e => e.from);
        expect(origins.length).toEqual(new Set(origins).size);
    });

    it("includes a matching node with no connections", () => {
        const graph = createTestGraph(
            ["node1", "node2", "node3"],
            [{ from: "node2", to: ["node3"] }]
        );
        markVulnerable(graph, "node1");

        const result = queryGraph(graph, { vulnerable: true });

        expect(result.nodes.map(n => n.name)).toEqual(["node1"]);
        expect(result.edges).toEqual([]);
    });
});

describe("queryGraph - empty results", () => {
    it("returns an empty graph when queried on an empty graph", () => {
        const emptyGraph = createTestGraph([], []);

        const result = queryGraph(emptyGraph, { vulnerable: true });

        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
    });

    it("returns an empty graph when no node matches the filter", () => {
        const graph = createTestGraph(
            ["node1", "node2"],
            [{ from: "node1", to: ["node2"] }]
        );
        // No node marked as vulnerable.

        const result = queryGraph(graph, { vulnerable: true });

        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
    });
});

describe("queryGraph - publicExposed filter values", () => {
  it("publicExposed=true traces downstream from public roots only", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: true });

    // Public branch only; privateRoot/sideMid/sqsTail are unreachable downstream from publicRoot.
    expectNodes(result, "publicRoot", "mid", "vulnNode", "rdsTail");
  });

  it("publicExposed=false traces downstream from non-public roots only", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: false });

    // Private branch only.
    expectNodes(result, "privateRoot", "sideMid", "sqsTail");
  });

  it("publicExposed=true returns empty when no public root exists", () => {
    const graph = createTestGraph(["privateRoot", "mid"], [{ from: "privateRoot", to: ["mid"] }]);
    Object.assign(graph.nodes[0]!, { kind: "service", publicExposed: false });

    const result = queryGraph(graph, { publicExposed: true });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

describe("queryGraph - sinkKind filter values", () => {
  it("sinkKind=rds traces upstream from rds tails only", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { sinkKind: "rds" });

    expectNodes(result, "publicRoot", "mid", "vulnNode", "rdsTail");
  });

  it("sinkKind=sqs traces upstream from sqs tails only", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { sinkKind: "sqs" });

    expectNodes(result, "privateRoot", "sideMid", "sqsTail");
  });

  it("sinkKind with no matching tail returns empty", () => {
    const graph = createMockQueryGraph(); // only rds tail

    const result = queryGraph(graph, { sinkKind: "sqs" });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

describe("queryGraph - vulnerable filter values", () => {
  it("vulnerable=true traces through nodes that have vulnerabilities", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { vulnerable: true });

    // vulnNode is mid-chain; trace reaches both adjacent routes.
    expectNodes(result, "publicRoot", "mid", "vulnNode", "rdsTail");
  });

  it("vulnerable=false seeds from non-vulnerable nodes (current engine behavior)", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { vulnerable: false });

    // Current track-based engine: traces from every non-vulnerable node in both
    // directions, which still reaches vulnNode via publicRoot → mid → vulnNode.
    expectNodes(result,
      "publicRoot", "privateRoot", "mid", "sideMid", "vulnNode", "rdsTail", "sqsTail"
    );
  });

  it("vulnerable=true returns empty when no node has vulnerabilities", () => {
    const graph = createTestGraph(["a", "b"], [{ from: "a", to: ["b"] }]);

    const result = queryGraph(graph, { vulnerable: true });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

describe("queryGraph - two-filter combinations", () => {
  it("publicExposed=true + sinkKind=rds → public route ending at rds", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: true, sinkKind: "rds" });

    expectNodes(result, "publicRoot", "mid", "vulnNode", "rdsTail");
  });

  it("publicExposed=true + sinkKind=sqs → empty (no sqs on public branch)", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: true, sinkKind: "sqs" });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("publicExposed=false + sinkKind=sqs → private route ending at sqs", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: false, sinkKind: "sqs" });

    expectNodes(result, "privateRoot", "sideMid", "sqsTail");
  });

  it("publicExposed=false + sinkKind=rds → empty (no rds on private branch)", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: false, sinkKind: "rds" });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("publicExposed=true + vulnerable=true → public route through vulnerable node", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: true, vulnerable: true });

    expectNodes(result, "publicRoot", "mid", "vulnNode", "rdsTail");
  });

  it("publicExposed=false + vulnerable=true → empty (vuln not on private branch)", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { publicExposed: false, vulnerable: true });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("sinkKind=rds + vulnerable=true → route to rds that passes through vuln", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { sinkKind: "rds", vulnerable: true });

    expectNodes(result, "publicRoot", "mid", "vulnNode", "rdsTail");
  });

  it("sinkKind=sqs + vulnerable=true → empty (no vuln on sqs branch)", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, { sinkKind: "sqs", vulnerable: true });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

describe("queryGraph - three-filter combinations", () => {
  it("all filters match → full public→vuln→rds route", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, {
      publicExposed: true,
      sinkKind: "rds",
      vulnerable: true
    });

    expectNodes(result, "publicRoot", "mid", "vulnNode", "rdsTail");
  });

  it("publicExposed=true + sinkKind=rds + vulnerable=true but vuln unreachable → empty", () => {
    const graph = createTestGraph(
      ["publicRoot", "mid", "rdsTail"],
      [
        { from: "publicRoot", to: ["mid"] },
        { from: "mid", to: ["rdsTail"] }
      ]
    );
    Object.assign(graph.nodes[0]!, { kind: "service", publicExposed: true });
    Object.assign(graph.nodes[1]!, { kind: "service", publicExposed: false });
    Object.assign(graph.nodes[2]!, { kind: "rds", publicExposed: false });
  // No vulnerable node anywhere

    const result = queryGraph(graph, {
      publicExposed: true,
      sinkKind: "rds",
      vulnerable: true
    });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("publicExposed=false + sinkKind=sqs + vulnerable=true → empty", () => {
    const graph = createExtendedFilterGraph();

    const result = queryGraph(graph, {
      publicExposed: false,
      sinkKind: "sqs",
      vulnerable: true
    });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});