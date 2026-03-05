# Crypto Wallet API

API REST de uma carteira cripto desenvolvida como teste técnico para vaga de **Desenvolvedor Backend**.

O sistema permite que usuários possuam uma carteira com múltiplos tokens, realizem depósitos, swaps entre moedas e saques, mantendo um **ledger auditável** de todas as movimentações financeiras.

A API segue princípios de **consistência transacional, idempotência e rastreabilidade contábil**, garantindo que todas as alterações de saldo possam ser reconstruídas a partir do histórico.

---

# Tecnologias utilizadas

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Prisma ORM
- JWT (Access Token + Refresh Token)
- Zod para validação de dados
- CoinGecko API para cotação de criptomoedas
- Render (deploy da API)

---

# Base URL

API publicada em:

```
https://projeto-backend-5j0m.onrender.com
```

Health check:

```
GET /health
```

Resposta:

```
{
  "ok": true,
  "message": "API rodando 🚀"
}
```

---

# Observação sobre o servidor

A API está hospedada no **Render (plano gratuito)**.

Por limitação da plataforma, a instância entra em modo **sleep após alguns minutos de inatividade**.

Isso significa que:

- A **primeira requisição pode demorar cerca de 30 a 60 segundos**
- Após isso, o servidor permanece ativo normalmente

Isso **não afeta o funcionamento da API**, apenas o tempo da primeira requisição.

---

# Arquitetura do projeto

O projeto utiliza uma **arquitetura modular baseada em domínio**, separando responsabilidades por módulos.

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

Essa organização facilita:

- manutenção
- escalabilidade
- isolamento de responsabilidades

---

# Modelagem de dados

O sistema utiliza um **modelo contábil baseado em ledger**.

Toda alteração de saldo gera um registro na tabela **LedgerEntry**, permitindo reconstruir o saldo completo da carteira a partir do histórico.

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

# Autenticação

Cadastro de usuário:

```
POST /auth/register
```

Login:

```
POST /auth/login
```

Refresh token:

```
POST /auth/refresh
```

Rotas protegidas utilizam:

```
Authorization: Bearer <access_token>
```

---

# Wallet

Cada usuário possui uma carteira criada automaticamente.

Consultar saldos:

```
GET /wallet/balances
```

Exemplo de resposta:

```
{
  "balances": [
    { "token": "BRL", "amount": 395 },
    { "token": "BTC", "amount": 0.00025859262604093376878 },
    { "token": "ETH", "amount": 0 }
  ]
}
```

---

# Depósito (Webhook)

Simula um serviço externo notificando depósitos.

```
POST /webhooks/deposit
```

Payload:

```
{
  "userId": "string",
  "token": "BRL",
  "amount": "500",
  "idempotencyKey": "deposit-123"
}
```

O sistema utiliza **idempotencyKey** para evitar execução duplicada.

---

# Cotação de swap

Obtém cotação de conversão entre tokens.

```
POST /swap/quote
```

Payload:

```
{
  "fromToken": "BRL",
  "toToken": "BTC",
  "amount": "100"
}
```

Resposta inclui:

- valor bruto
- taxa
- valor líquido
- taxa utilizada
- tempo de cache da cotação

---

# Execução de swap

Realiza conversão entre tokens.

```
POST /swap
```

Payload:

```
{
  "fromToken": "BRL",
  "toToken": "BTC",
  "amount": "100",
  "idempotencyKey": "swap-123"
}
```

Taxa aplicada:

```
1.5%
```

Cada swap gera **3 entradas no ledger**:

```
SWAP_OUT
SWAP_IN
SWAP_FEE
```

---

# Saque

Permite retirar saldo da carteira.

```
POST /transactions/withdraw
```

Validações:

- saldo suficiente
- idempotência da operação

---

# Ledger (Extrato)

Consulta as movimentações da carteira.

```
GET /ledger
```

Suporta paginação:

```
take
cursor
skip
```

Exemplo:

```
GET /ledger?take=20
GET /ledger?take=20&cursor=ledger_id
```

Cada registro contém:

```
type
token
amount
previousBalance
newBalance
transactionId
createdAt
```

---

# Histórico de transações

Lista as transações executadas na carteira.

```
GET /transactions
```

Tipos de transação:

```
DEPOSIT
SWAP
WITHDRAWAL
```

Também suporta paginação.

---

# Segurança e consistência

## Idempotência

Utilizada em:

```
deposit
swap
withdrawal
```

Evita duplicação de operações em caso de retries.

---

## Controle de concorrência

Operações críticas utilizam:

```
SELECT ... FOR UPDATE
```

Garantindo consistência de saldo mesmo com múltiplas requisições simultâneas.

---

# API externa

Cotações obtidas via:

```
https://api.coingecko.com/api/v3/simple/price
```

---

# Como rodar o projeto localmente

Instalar dependências:

```
npm install
```

Rodar migrations:

```
npx prisma migrate dev
```

Gerar Prisma Client:

```
npx prisma generate
```

Rodar servidor:

```
npm run dev
```

Servidor local:

```
http://localhost:3333
```

---

# Autor

Kauã Silva  
Desenvolvedor Backend  
