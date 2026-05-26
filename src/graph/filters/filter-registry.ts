import type { NodeKind } from "../../models/node/node-types";
import { hasVulnerabilities, isPublic } from "../../models/node/node-attributes";
import type { FilterDef } from "./filter-types";

const publicExposed: FilterDef<boolean> = {
  name: "publicExposed",
  scope: "start",
  predicate: (n, v) => isPublic(n) === v,
};

const sinkKind: FilterDef<NodeKind> = {
  name: "sinkKind",
  scope: "end",
  predicate: (n, v) => n.kind === v,
};

const vulnerable: FilterDef<boolean> = {
  name: "vulnerable",
  scope: "any",
  predicate: (n, v) => hasVulnerabilities(n) === v,
  mode: (v) => (v ? "trace" : "exclude"),
};

export const filterRegistry: Record<string, FilterDef<any>> = {
  [publicExposed.name]: publicExposed,
  [sinkKind.name]: sinkKind,
  [vulnerable.name]: vulnerable,
};