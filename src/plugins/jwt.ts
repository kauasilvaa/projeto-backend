import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance } from "fastify";
import { env } from "../env";

async function jwtPlugin(app: FastifyInstance) {
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });

  app.decorate("authenticate", async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: "Unauthorized" });
    }
  });
}

export default fp(jwtPlugin);

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<any>;
  }
}