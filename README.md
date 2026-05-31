# Train Ticket Graph Query API

A TypeScript service that loads a microservice dependency graph from JSON, indexes it for fast traversal, and exposes a REST endpoint to return filtered subgraph.

---

## Overview

```
Startup:  JSON file → loadGraph() → Graph (nodes, edges, adjacency maps)
Request:  GET /api/v1/graph?<filters>… → Zod validation → queryGraph() → RawGraph JSON
```

The graph is loaded **once at startup** and kept in memory. Each request runs the query engine against that shared graph without mutating it.

The query engine is **registry-driven**: each filter declares its scope, predicate, and optional mode. The engine applies active filters in sequence with **AND** semantics, narrowing an allowed-node set until a final induced subgraph is returned.

---

## Assumptions

### Graph and routes

- The graph is **directed**. An edge `A → B` means *A invokes or depends on B* (downstream direction).
- A **route** is a path of nodes connected by edges, in call direction `A → B → C`.
- **Root** (start) nodes have **no incoming edges** - they never appear as another edge’s destination.
- **Tail** (end) nodes have **no outgoing edges** - they never appear as an edge origin.
- Cycles are allowed. Traversal tracks visited nodes and terminates naturally.
- A node with no edges can still appear in the result if it matches the filter on its own (e.g. a vulnerable node with no connections when `vulnerable=true`).

### Input data

- Edge `to` may be a **string or string array**; the loader normalizes to `string[]`.
- A node is **public** only when `publicExposed === true` (missing or `false` means not public).
- A node is **vulnerable** when it has a non-empty `vulnerabilities` array.
- Invalid JSON or a missing data file fails at startup (the process exits).Malformed query parameters return **400** without affecting the loaded graph.

### Filter composition

- Multiple query parameters are combined with **logical AND**: every active filter must be satisfied.

### API response shape

- Responses always use **`RawGraph`**: `{ nodes, edges }` only, to retain the same format as the original JSON file.
- Edges in the response are **filtered and merged**: only edges whose `from` and all `to` targets remain in the allowed node set are included.

### Query parameter parsing

- Unknown query parameters are rejected (`.strict()` on the Zod schema).

---

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| **Precomputed adjacency maps** | Tracing is O(nodes + edges) per pass; maps are built once at load time. |
| **Separate in-memory `Graph` vs response `RawGraph`** | Keeps indexing structures server-side; API stays render-friendly. |
| **Filter registry + `FilterDef`** | New filters are a registry entry + schema field + tests - no changes to the core loop’s structure. |
| **Zod at the API boundary only** | `GraphQuerySchema` validates HTTP input; `FilterDef` handles graph semantics. No duplicate `parse()` on each filter. |
| **`GraphQuery` inferred from schema** | Single source of truth for allowed query shape and TypeScript types. |
| **Graph loaded from `dist/data/` in production** | `tsc` does not copy JSON; the build script copies `src/data` → `dist/data`. |
| **Express 5 + Vitest** | Development runs TypeScript via `tsx`; production uses compiled JavaScript from `npm run build`. |

---

## Project structure

```
src/
  index.ts                    # Load graph, start server
  server.ts                   # Express app wiring
  data/train-ticket.json      # Source dataset (copied to dist/ on build)
  models/
    graph.ts                  # Graph / RawGraph types, GraphQuerySchema
    edge.ts                   # Edge types
    node/
      node-types.ts           # GraphNode, NodeKind, Vulnerability
      node-attributes.ts      # isPublic(), hasVulnerabilities()
  graph/
    graph-loader.ts           # JSON I/O, edge normalization, adjacency maps
    graph-query.ts            # Query engine (trace, exclude, complete-route repair)
    graph-query.test.ts       # Unit tests
    filters/
      filter-types.ts         # FilterDef, FilterScope, FilterMode
      filter-registry.ts      # Registered filters (publicExposed, sinkKind, vulnerable)
  api/
    routes.ts                 # /api/v1 mount
    v1/graph-router.ts        # GET /graph handler
```

**Layering:** `api` → `graph` (query + filters) → `models` (types). Filter types live under `graph/filters/` because they define query-engine extension points, not persisted entity shapes.

---

## Query engine

### Pipeline (`queryGraph`)

1. **Empty query** - return full graph as `RawGraph` (fast path).
2. **`getAllowedNodes`** - apply all filters in **exclude** mode (remove matching nodes from the permitted set).
3. **Trace loop** - for each active filter in **trace** mode, find candidates by scope, match predicate, trace in the configured direction(s), intersect with `currentAllowedNodes`.
4. **Complete-route repair** - if any exclude filter ran, keep only nodes on at least one **root → tail** path within the permitted set (see below).
5. **Materialize result** - filter node list and rebuild edges.

If any trace filter finds no matching candidates, or the allowed set becomes empty, return `{ nodes: [], edges: [] }`.

### Filter scope and trace direction

| Scope | Candidates checked | Trace direction |
|-------|-------------------|-----------------|
| `start` | Root nodes | Downstream only |
| `end` | Tail nodes | Upstream only |
| `any` | All nodes | Downstream **and** upstream (union) |

Trace exploration respects `currentAllowedNodes`: neighbors outside the set are not visited.

### Filter modes

| Mode | When | Behavior |
|------|------|----------|
| `trace` (default) | e.g. `vulnerable=true`, `publicExposed=true` | Include nodes reachable from candidates matching the predicate. |
| `exclude` | e.g. `vulnerable=false` | Remove nodes where `predicate(node, true)` before tracing; skip in trace loop. |

The **`mode` function** on a filter selects trace vs exclude based on the parsed query value. Filters without `mode` always trace.

### Why `vulnerable=false` needs an extra step

Excluding vulnerable nodes can leave **orphan tails** - nodes still in the set but no longer on a complete path (e.g. an RDS tail whose only upstream path went through a removed vuln node).

After exclusion, **`keepNodesOnCompleteRoutes`** keeps a node only if it is:

- reachable **downstream from some root**, and
- can reach **some tail** going **upstream**,

both within the current permitted set. This enforces: *complete routes with zero vulnerable nodes*, compatible with combining `vulnerable=false` alongside `publicExposed` or `sinkKind`.

---

## Filters

- `publicExposed=false` - seed non-public roots, trace downstream.
  Only the **starting** node must be non-public; nodes further down the route are not checked for this filter.

- **Scope:** `start`
- **Mode:** trace
- **`publicExposed=true`:** seed public roots, trace downstream.
- **`publicExposed=false`:** seed non-public roots, trace downstream.

### `sinkKind` - routes ending at a specific sink kind.

- **Scope:** `end`
- **Mode:** trace
- **Values:** `service`, `rds`, `sqs` (from `NodeKind`)
- **`sinkKind=rds`:** seed RDS tail nodes, trace upstream.

### `vulnerable` - routes involving vulnerabilities.

- **Scope:** `any`
- **`vulnerable=true` (trace):** seed nodes with vulnerabilities, trace both directions - routes that **pass through** at least one vulnerable node.
- **`vulnerable=false` (exclude):** remove all vulnerable nodes, then apply complete-route repair - routes with **no** vulnerable node on a full root→tail path.

---

## REST API

### `GET /api/v1/graph`

Returns a JSON subgraph.

**Query parameters (all optional):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `publicExposed` | `"true"` \| `"false"` | Filter by public entry points |
| `sinkKind` | `service` \| `rds` \| `sqs` | Filter by sink node kind |
| `vulnerable` | `"true"` \| `"false"` | Filter by vulnerability presence |

**Examples:**

```bash
curl "http://localhost:3000/api/v1/graph"
curl "http://localhost:3000/api/v1/graph?publicExposed=true"
curl "http://localhost:3000/api/v1/graph?sinkKind=rds"
curl "http://localhost:3000/api/v1/graph?vulnerable=true"
curl "http://localhost:3000/api/v1/graph?publicExposed=true&sinkKind=rds&vulnerable=false"
```

**Success:** `200` with `{ "nodes": [...], "edges": [...] }`

**Validation error:** `400` with `{ "error": "Invalid query parameters", "details": ... }`

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `SERVER_PORT` | `3000` | HTTP listen port |

---

## Extensibility: adding a filter

1. **Registry** - add a `FilterDef` in `src/graph/filters/filter-registry.ts`:

   ```typescript
   const myFilter: FilterDef<string> = {
     name: "myFilter",
     scope: "start", // or "end" | "any"
     predicate: (node, value) => node.field === value /* node matches value */,
     mode: (value) => (value === "excludeMe" ? "exclude" : "trace"), // optional
   };
   ```

2. **Schema** - add the field to `GraphQuerySchema` in `src/models/graph.ts` (type inference updates `GraphQuery` automatically).

3. **Tests** - add cases in `src/graph/graph-query.test.ts` for single-filter behavior and combinations with existing filters.

No changes to `queryGraph`’s control flow are required.

---

## Running the project

```bash
npm install
npm run dev          # development (tsx watch, src/)
npm run build        # compile + copy src/data → dist/data
npm start            # production (node dist/)
npm test             # vitest (34 tests)
```

Requires Node.js 18+.

---

## Known limitations

- **Single graph file** - path is fixed relative to compiled output; no hot reload of data without restart.
- **No authentication or rate limiting** - out of assignment scope.

---

## Future work

- For heavier graphs, investigate alternatives to loading the full JSON into memory (chunked loading, external storage with indexed lookups, querying a dedicated graph store instead of a single in-process structure).
- Add an export endpoint that returns the filtered subgraph in a standard visualization format (e.g. Mermaid flowchart syntax) for easy rendering in docs and dashboards.

---

## Tech stack

- **TypeScript 6**, **Express 5**, **Zod 4**, **Vitest 4**
- Dev: **tsx** for watch mode; production: **tsc** with `module: node16`