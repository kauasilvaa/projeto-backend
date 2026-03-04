# Crypto Wallet API

API REST de uma carteira cripto desenvolvida como teste técnico para vaga de Desenvolvedor Backend.

O sistema permite que usuários possuam uma carteira com múltiplos tokens, realizem depósitos, swaps entre moedas e saques, mantendo um ledger auditável de todas as movimentações.

---

# Tecnologias utilizadas

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Prisma ORM
- JWT (Access + Refresh Token)
- Zod para validação de dados
- CoinGecko API para cotação de criptomoedas

---

# Arquitetura do projeto

O projeto utiliza uma arquitetura modular baseada em domínio, separando responsabilidades por módulos.

```
src/
  modules/
    auth/
    wallet/
    swap/
    transactions/
    ledger/
    webhooks/

  plugins/
    jwt.ts

  lib/
    prisma.ts

  http/
    http-error.ts

  app.ts
  server.ts
```

Cada módulo possui:

```
schemas.ts   -> validação de dados
service.ts   -> regras de negócio
routes.ts    -> definição dos endpoints
```

---

# Modelagem de dados

O sistema utiliza um modelo contábil baseado em ledger.

Toda alteração de saldo gera um registro na tabela LedgerEntry, permitindo reconstruir o saldo completo da carteira a partir do histórico.

Principais entidades:

```
User
Wallet
Balance
Transaction
LedgerEntry
DepositWebhook
SwapRequest
WithdrawalRequest
```

---

# Tokens suportados

```
BRL
BTC
ETH
```

---

# Funcionalidades

## Autenticação

- Cadastro de usuário
- Login com JWT
- Refresh token
- Rotas protegidas

---

## Wallet

Cada usuário possui uma carteira criada automaticamente.

Endpoint:

```
GET /wallet/balances
```

Retorna os saldos por token.

---

## Depósito (Webhook)

Simula um serviço externo notificando depósitos.

```
POST /webhooks/deposit
```

Payload:

```
{
  userId,
  token,
  amount,
  idempotencyKey
}
```

O sistema utiliza idempotencyKey para evitar execução duplicada.

---

## Swap de tokens

Permite converter tokens utilizando cotação da API CoinGecko.

Taxa aplicada:

```
1.5%
```

Endpoints:

```
GET  /swap/quote
POST /swap/execute
```

---

## Saque

Permite retirar saldo da carteira.

```
POST /transactions/withdraw
```

Valida:

- saldo suficiente
- idempotência da operação

---

## Ledger (Extrato)

Consulta as movimentações da carteira.

```
GET /ledger
```

Suporta:

- paginação
- filtro por token
- filtro por tipo

---

## Histórico de transações

Lista as transações executadas na carteira.

```
GET /transactions
```

Tipos:

```
DEPOSIT
SWAP
WITHDRAWAL
```

---

# Segurança e consistência

## Idempotência

Utilizada em:

```
deposit
swap
withdrawal
```

Evita duplicação de operações.

---

## Controle de concorrência

Operações críticas utilizam:

```
SELECT ... FOR UPDATE
```

Garantindo consistência de saldo mesmo com execuções simultâneas.

---

# API externa

Cotações obtidas via:

```
https://api.coingecko.com/api/v3/simple/price
```

---

# Como rodar o projeto

### 1 Instalar dependências

```
npm install
```

### 2 Rodar migrations

```
npx prisma migrate dev
```

### 3 Gerar Prisma Client

```
npx prisma generate
```

### 4 Rodar servidor

```
npm run dev
```

Servidor roda em:

```
http://localhost:3333
```

---

# Melhorias futuras

- Cache de cotações com Redis
- Testes automatizados
- Deploy em cloud
- Interface web

---

# Autor

Kauã Silva  
Desenvolvedor Backend