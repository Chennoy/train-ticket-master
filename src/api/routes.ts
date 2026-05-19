import { Router } from "express";
import type { Graph } from "../models/graph";
import { createGraphRouter } from "./v1/graph-router";

export function registerV1Routes(graph: Graph): Router {
    const router = Router();

    router.use("/graph", createGraphRouter(graph));

    return router;
}