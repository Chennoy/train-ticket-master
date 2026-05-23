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

export interface FilterDef<V = unknown> {
  readonly name: string;
  readonly scope: FilterScope;
  parse(raw: string): V;
  predicate(node: GraphNode, value: V): boolean;
}