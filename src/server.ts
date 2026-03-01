const Fastify = require("fastify");

const app = Fastify();

app.get("/health", async () => {
  return { ok: true, message: "API rodando 🚀" };
});

app.listen({ port: 3333 }, () => {
  console.log("Servidor rodando em http://localhost:3333");
});