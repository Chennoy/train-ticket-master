import type { GraphNode } from "../../models/node/node-types";

/**
 * Where in a route a filter applies.
 * - "start": predicate is checked against root nodes (nodes with no incoming edges).
 * - "end":   predicate is checked against tail nodes (nodes with no outgoing edges).
 * - "any":   route must contain at least one node satisfying the predicate
 *            (or zero such nodes when the parsed value is the "negated" form;
 *            see engine for the exact handling).
 */
export type FilterScope = "start" | "end" | "any";

/**
 * How the engine applies a filter for a given query value.
 * - "trace":   include nodes reachable from candidates matching the predicate.
 * - "exclude": remove matching nodes so no route can pass through them.
 */
export type FilterMode = "trace" | "exclude";

export interface FilterDef<V = unknown> {
  readonly name: string;
  readonly scope: FilterScope;
  predicate(node: GraphNode, value: V): boolean;
  mode?(value: V): FilterMode; // Optional
}