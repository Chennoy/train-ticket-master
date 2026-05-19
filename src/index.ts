import path from "path";

import { loadGraph } from "./graph/graph-loader";
import { startServer } from "./server";

const graphPath = path.join(
    __dirname,
    "data",
    "train-ticket.json"
);

const graph = loadGraph(graphPath);
startServer(graph);
