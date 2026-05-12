import path from "path";

import { loadGraph } from "./infrastructure/graph-loader";
import { getRootNodes } from "./infrastructure/graph-query";

const graphPath = path.join(
    __dirname,
    "data",
    "train-ticket.json"
);

const graph = loadGraph(graphPath);
console.log("Root nodes:", getRootNodes(graph));

