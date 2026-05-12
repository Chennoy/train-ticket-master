import path from "path";

import { loadGraph } from "./services/graph-loader";
import { getRootNodes } from "./services/graph-query";

const graphPath = path.join(
    __dirname,
    "data",
    "train-ticket.json"
);

const graph = loadGraph(graphPath);
console.log("Root nodes:", getRootNodes(graph));

