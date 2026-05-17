import path from "path";

import { loadGraph } from "./graph/graph-loader";
import { getRootNodes } from "./graph/graph-query";

const graphPath = path.join(
    __dirname,
    "data",
    "train-ticket.json"
);

const graph = loadGraph(graphPath);
console.log("Root nodes:", getRootNodes(graph));

