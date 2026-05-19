import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { queryGraph } from "../../graph/graph-query";
import type { Graph, GraphQuery } from "../../models/graph";

export const graphQuerySchema = z.object({
    sinkKind: z.enum(["service", "rds", "sqs"]).optional(),
    publicExposed: z.coerce.boolean().optional(),
    vulnerable: z.coerce.boolean().optional(),
});

export function createGraphRouter(graph: Graph): Router {
    const router = Router();

    router.get("/", (req: Request, res: Response) => {
        const parsed = graphQuerySchema.safeParse(req.query);
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
