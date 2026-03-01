import { FastifyInstance } from "fastify";
import { getWalletBalances } from "./service";

export async function walletRoutes(app: FastifyInstance) {
  app.get(
    "/wallet/balances",
    { preHandler: [app.authenticate] },
    async (request: any, reply) => {
      const userId = request.user.sub as string;
      const balances = await getWalletBalances(userId);
      return reply.status(200).send({ balances });
    }
  );
}