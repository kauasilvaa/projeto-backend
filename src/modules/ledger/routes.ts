import type { FastifyInstance } from "fastify";
import { ledgerQuerySchema } from "./schemas";
import { getLedger } from "./service";

export async function ledgerRoutes(app: FastifyInstance) {
  app.get("/ledger", { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as any).sub as string;

    const query = ledgerQuerySchema.parse(request.query);

    const result = await getLedger({
      userId,
      take: query.take,
      cursor: query.cursor,
      token: query.token as any,
      type: query.type as any,
    });

    return reply.status(result.status).send(result.body);
  });
}