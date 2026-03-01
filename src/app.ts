import Fastify from "fastify";
import { ZodError } from "zod";
import jwtPlugin from "./plugins/jwt";
import { authRoutes } from "./modules/auth/routes";
import { walletRoutes } from "./modules/wallet/routes";
import { HttpError } from "./http/http-error";

export const app = Fastify({ logger: true });

(globalThis as any).__app = app;

app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
  if (error instanceof ZodError) {
    return reply.status(400).send({ message: "Validation error", issues: error.issues });
  }

  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  return reply.status(500).send({ message: "Internal server error" });
});

app.register(jwtPlugin);
app.register(authRoutes);
app.register(walletRoutes);

app.get("/health", async () => {
  return { ok: true, message: "API rodando 🚀" };
});