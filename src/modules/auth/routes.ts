import { FastifyInstance } from "fastify";
import { registerSchema, loginSchema, refreshSchema } from "./schemas";
import { registerUser, loginUser, rotateRefreshToken } from "./service";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const user = await registerUser(body);
    return reply.status(201).send(user);
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const tokens = await loginUser(body);
    return reply.status(200).send(tokens);
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const tokens = await rotateRefreshToken(body);
    return reply.status(200).send(tokens);
  });
}