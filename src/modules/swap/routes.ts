import { FastifyInstance } from "fastify";
import { swapExecuteSchema, swapQuoteSchema } from "./schemas";
import { executeSwap, getSwapQuote } from "./service";

export async function swapRoutes(app: FastifyInstance) {
  app.post("/swap/quote", async (request, reply) => {
    const dto = swapQuoteSchema.parse(request.body);
    const result = await getSwapQuote(dto);
    return reply.status(result.status).send(result.body);
  });

  app.post("/swap", { preHandler: [app.authenticate] }, async (request, reply) => {
    const dto = swapExecuteSchema.parse(request.body);
    const userId = (request.user as any).sub as string;

    const result = await executeSwap({
      userId,
      fromToken: dto.fromToken,
      toToken: dto.toToken,
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
      requestBody: request.body,
      requestHeaders: request.headers,
    });

    return reply.status(result.status).send(result.body);
  });
}