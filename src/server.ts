import express from "express";
import type { Graph } from "./models/graph";
import { registerV1Routes } from "./api/routes";

export function startServer(graph: Graph): void {
    const app = express();
    app.use(express.json());
    app.use("/api/v1", registerV1Routes(graph));

    const port = process.env.SERVER_PORT || 3000;

    app.listen(port, () => {console.info(`Server listening on port ${port}`);});
}