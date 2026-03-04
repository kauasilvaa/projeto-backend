import type { FastifyInstance } from "fastify";
import { withdrawSchema, transactionsQuerySchema } from "./schemas";
import { executeWithdrawal, getTransactions } from "./service";

export async function transactionsRoutes(app: FastifyInstance) {
  app.post(
    "/transactions/withdraw",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const dto = withdrawSchema.parse(request.body);
      const userId = (request.user as any).sub as string;

      const result = await executeWithdrawal({
        userId,
        token: dto.token as any,
        amount: dto.amount,
        idempotencyKey: dto.idempotencyKey,
        requestBody: request.body,
        requestHeaders: request.headers,
      });

      return reply.status(result.status).send(result.body);
    }
  );

  app.get(
    "/transactions",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;

      const query = transactionsQuerySchema.parse(request.query);

      const result = await getTransactions({
        userId,
        take: query.take,
        cursor: query.cursor,
        type: query.type as any,
      });

      return reply.status(result.status).send(result.body);
    }
  );
}