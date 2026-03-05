import Fastify from "fastify";
import { ZodError } from "zod";

import jwtPlugin from "./plugins/jwt";
import { HttpError } from "./http/http-error";

import { authRoutes } from "./modules/auth/routes";
import { walletRoutes } from "./modules/wallet/routes";
import { webhooksRoutes } from "./modules/webhooks/routes";
import { swapRoutes } from "./modules/swap/routes";
import { transactionsRoutes } from "./modules/transactions/routes";
import { ledgerRoutes } from "./modules/ledger/routes";

export const app = Fastify({ logger: true });

// útil pra testes/debug
(globalThis as any).__app = app;

app.setErrorHandler((error, _request, reply) => {
  app.log.error({ err: error });

  if (error instanceof ZodError) {
    return reply
      .status(400)
      .send({ message: "Validation error", issues: error.issues });
  }

  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  return reply.status(500).send({ message: "Internal server error" });
});

app.register(jwtPlugin);

const API_PREFIX = process.env.API_PREFIX ?? "";

// Rotas
app.register(authRoutes, { prefix: API_PREFIX });
app.register(walletRoutes, { prefix: API_PREFIX });
app.register(webhooksRoutes, { prefix: API_PREFIX });
app.register(swapRoutes, { prefix: API_PREFIX });
app.register(transactionsRoutes, { prefix: API_PREFIX });
app.register(ledgerRoutes, { prefix: API_PREFIX });


app.get("/", async () => {
  return { ok: true, service: "crypto-wallet-api" };
});


app.get("/health", async () => {
  return { ok: true, message: "API rodando 🚀" };
});