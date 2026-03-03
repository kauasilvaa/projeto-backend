import { FastifyInstance } from "fastify";
import { depositWebhookSchema } from "./schemas";
import { handleDepositWebhook } from "./service";

export async function webhooksRoutes(app: FastifyInstance) {
  app.post("/webhooks/deposit", async (request, reply) => {
    const dto = depositWebhookSchema.parse(request.body);
    const result = await handleDepositWebhook({
      ...dto,
      requestBody: request.body,
      requestHeaders: request.headers,
    });
    return reply.status(result.status).send(result.body);
  });
}