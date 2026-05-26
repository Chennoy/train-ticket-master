import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { queryGraph } from "../../graph/graph-query";
import { GraphQuerySchema, type Graph, type GraphQuery } from "../../models/graph";

export function createGraphRouter(graph: Graph): Router {
    const router = Router();

    router.get("/", (req: Request, res: Response) => {
        const parsed = GraphQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid query parameters",
                details: z.flattenError(parsed.error),
            });
            return;
        }

        const query = parsed.data as GraphQuery;
        res.json(queryGraph(graph, query));
    });

    return router;
}
