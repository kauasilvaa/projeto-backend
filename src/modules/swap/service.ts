import axios from "axios";
import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
import { Prisma, LedgerType, Token, TransactionType } from "@prisma/client";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3/simple/price";

const tokenToCoinGeckoId: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BRL: "brl",
};

type QuoteDTO = {
  fromToken: Token;
  toToken: Token;
  amount: string;
};

function calcSwap(
  amount: Prisma.Decimal,
  priceBrlPerCrypto: Prisma.Decimal,
  fromToken: Token,
  toToken: Token
) {
  if (fromToken === "BRL" && (toToken === "BTC" || toToken === "ETH")) {
    const gross = amount.div(priceBrlPerCrypto);
    const fee = gross.mul(0.015);
    const net = gross.minus(fee);
    return { grossDest: gross, feeDest: fee, netDest: net, rate: priceBrlPerCrypto };
  }

  if ((fromToken === "BTC" || fromToken === "ETH") && toToken === "BRL") {
    const gross = amount.mul(priceBrlPerCrypto);
    const fee = gross.mul(0.015);
    const net = gross.minus(fee);
    return { grossDest: gross, feeDest: fee, netDest: net, rate: priceBrlPerCrypto };
  }

  return null;
}

/**
 * Cache em memória (fallback quando Redis/CoinGecko falhar)
 */
type MemCacheEntry = { value: Prisma.Decimal; expiresAt: number; updatedAt: number };
const memCache = new Map<string, MemCacheEntry>();

function getMemCached(key: string) {
  const e = memCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) return null;
  return e.value;
}

// Permite usar um valor “stale” por alguns minutos quando CoinGecko dá 429/erro
function getMemCachedStale(key: string, maxStaleMs: number) {
  const e = memCache.get(key);
  if (!e) return null;
  if (Date.now() - e.updatedAt > maxStaleMs) return null;
  return e.value;
}

function setMemCached(key: string, value: Prisma.Decimal, ttlSeconds: number) {
  const now = Date.now();
  memCache.set(key, {
    value,
    expiresAt: now + ttlSeconds * 1000,
    updatedAt: now,
  });
}

async function getCachedPrice(key: string) {
  try {
    // se você não configurou Redis no ambiente, evita tentar usar cache
    if (!process.env.REDIS_URL) return null;
    if (!redis) return null;

    const v = await redis.get(key);
    if (!v) return null;

    return new Prisma.Decimal(v);
  } catch {
    return null;
  }
}

async function setCachedPrice(key: string, value: string, ttlSeconds: number) {
  try {
    if (!process.env.REDIS_URL) return;
    if (!redis) return;

    await redis.set(key, value, "EX", ttlSeconds);
  } catch {}
}

function quoteTtlSeconds() {
  const ttl = Number(process.env.QUOTE_CACHE_TTL ?? 30);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 30;
}

async function getBrlPriceForToken(token: Token) {
  if (token === "BRL") return new Prisma.Decimal(1);

  const ttl = quoteTtlSeconds();
  const cacheKey = `quote:brl:${token}`;

  // 1) Redis
  const cachedRedis = await getCachedPrice(cacheKey);
  if (cachedRedis) {
    setMemCached(cacheKey, cachedRedis, ttl); // alimenta memória também
    return cachedRedis;
  }

  // 2) Memória
  const cachedMem = getMemCached(cacheKey);
  if (cachedMem) return cachedMem;

  // 3) CoinGecko (com fallback se rate limit / erro)
  const id = tokenToCoinGeckoId[token];

  try {
    const response = await axios.get(COINGECKO_BASE, {
      params: { ids: id, vs_currencies: "brl" },
      timeout: 8000,
      headers: {
        // ajuda a identificar client (não resolve rate limit, mas é bom padrão)
        "User-Agent": "crypto-wallet-api/1.0",
      },
    });

    const raw = response?.data?.[id]?.brl;
    if (raw === undefined || raw === null) {
      throw new Error("price provider returned empty data");
    }

    const price = new Prisma.Decimal(raw);

    setMemCached(cacheKey, price, ttl);
    await setCachedPrice(cacheKey, price.toString(), ttl);

    return price;
  } catch (err: any) {
    // se CoinGecko bloqueou (429) ou deu erro, usa cache “stale” por até 5 min
    const stale = getMemCachedStale(cacheKey, 5 * 60 * 1000);
    if (stale) return stale;

    // tenta também o Redis de novo (caso tenha voltado)
    const retryRedis = await getCachedPrice(cacheKey);
    if (retryRedis) return retryRedis;

    // sem fallback => sobe erro “controlado”
    const status = err?.response?.status;
    if (status === 429) {
      throw new Error("PRICE_RATE_LIMIT");
    }

    throw new Error("PRICE_PROVIDER_DOWN");
  }
}

export async function getSwapQuote(dto: QuoteDTO) {
  if (dto.fromToken === dto.toToken)
    return { status: 400, body: { message: "tokens must be different" } };

  const amount = new Prisma.Decimal(dto.amount);
  if (amount.lte(0))
    return { status: 400, body: { message: "amount must be > 0" } };

  const supported =
    (dto.fromToken === "BRL" && (dto.toToken === "BTC" || dto.toToken === "ETH")) ||
    ((dto.fromToken === "BTC" || dto.fromToken === "ETH") && dto.toToken === "BRL");

  if (!supported)
    return { status: 400, body: { message: "swap pair not supported yet" } };

  let price: Prisma.Decimal;
  try {
    price =
      dto.fromToken === "BRL"
        ? await getBrlPriceForToken(dto.toToken)
        : await getBrlPriceForToken(dto.fromToken);
  } catch (e: any) {
    if (e?.message === "PRICE_RATE_LIMIT") {
      return { status: 503, body: { message: "price provider rate limited, try again shortly" } };
    }
    return { status: 503, body: { message: "price provider unavailable, try again shortly" } };
  }

  const calc = calcSwap(amount, price, dto.fromToken, dto.toToken);
  if (!calc)
    return { status: 400, body: { message: "swap pair not supported yet" } };

  return {
    status: 200,
    body: {
      fromToken: dto.fromToken,
      toToken: dto.toToken,
      inputAmount: amount.toString(),
      grossAmount: calc.grossDest.toString(),
      fee: calc.feeDest.toString(),
      netAmount: calc.netDest.toString(),
      rateUsed: calc.rate.toString(),
      cachedTtlSeconds: quoteTtlSeconds(),
    },
  };
}

type ExecuteDTO = {
  userId: string;
  fromToken: Token;
  toToken: Token;
  amount: string;
  idempotencyKey: string;
  requestBody?: unknown;
  requestHeaders?: unknown;
};

export async function executeSwap(dto: ExecuteDTO) {
  if (dto.fromToken === dto.toToken)
    return { status: 400, body: { message: "tokens must be different" } };

  const amount = new Prisma.Decimal(dto.amount);
  if (amount.lte(0))
    return { status: 400, body: { message: "amount must be > 0" } };

  const supported =
    (dto.fromToken === "BRL" && (dto.toToken === "BTC" || dto.toToken === "ETH")) ||
    ((dto.fromToken === "BTC" || dto.fromToken === "ETH") && dto.toToken === "BRL");

  if (!supported)
    return { status: 400, body: { message: "swap pair not supported yet" } };

  const wallet = await prisma.wallet.findUnique({
    where: { userId: dto.userId },
    select: { id: true },
  });

  if (!wallet) return { status: 404, body: { message: "user not found" } };

  const done = await prisma.swapRequest.findUnique({
    where: { idempotencyKey: dto.idempotencyKey },
    select: { status: true, transactionId: true, processedAt: true },
  });

  if (done?.status === "PROCESSED") {
    return {
      status: 200,
      body: {
        message: "already processed",
        idempotencyKey: dto.idempotencyKey,
        transactionId: done.transactionId,
        processedAt: done.processedAt,
      },
    };
  }

  let price: Prisma.Decimal;
  try {
    price =
      dto.fromToken === "BRL"
        ? await getBrlPriceForToken(dto.toToken)
        : await getBrlPriceForToken(dto.fromToken);
  } catch (e: any) {
    if (e?.message === "PRICE_RATE_LIMIT") {
      return { status: 503, body: { message: "price provider rate limited, try again shortly" } };
    }
    return { status: 503, body: { message: "price provider unavailable, try again shortly" } };
  }

  const calc = calcSwap(amount, price, dto.fromToken, dto.toToken);
  if (!calc) return { status: 400, body: { message: "swap pair not supported yet" } };

  const grossDest = calc.grossDest;
  const feeDest = calc.feeDest;
  const netDest = calc.netDest;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.swapRequest.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        select: { id: true, status: true, transactionId: true, processedAt: true },
      });

      if (existing?.status === "PROCESSED") {
        return {
          kind: "REPLAY" as const,
          transactionId: existing.transactionId!,
          processedAt: existing.processedAt!,
        };
      }

      const swapReq =
        existing ??
        (await tx.swapRequest.create({
          data: {
            idempotencyKey: dto.idempotencyKey,
            userId: dto.userId,
            walletId: wallet.id,
            fromToken: dto.fromToken,
            toToken: dto.toToken,
            amount,
            rateUsed: calc.rate,
            grossAmount: grossDest,
            feeAmount: feeDest,
            netAmount: netDest,
            status: "RECEIVED",
            requestBody: dto.requestBody as any,
            requestHeaders: dto.requestHeaders as any,
          },
          select: { id: true },
        }));

      await tx.balance.upsert({
        where: { walletId_token: { walletId: wallet.id, token: dto.fromToken } },
        create: { walletId: wallet.id, token: dto.fromToken, amount: new Prisma.Decimal(0) },
        update: {},
      });

      await tx.balance.upsert({
        where: { walletId_token: { walletId: wallet.id, token: dto.toToken } },
        create: { walletId: wallet.id, token: dto.toToken, amount: new Prisma.Decimal(0) },
        update: {},
      });

      const tokensToLock = [dto.fromToken, dto.toToken].sort();

      const rows = await tx.$queryRaw<Array<{ id: string; token: string; amount: string }>>`
        SELECT "id", "token", "amount"
        FROM "Balance"
        WHERE "walletId" = ${wallet.id}
        AND "token" IN (${tokensToLock[0]}, ${tokensToLock[1]})
        FOR UPDATE
      `;

      const fromRow = rows.find((r) => r.token === dto.fromToken);
      const toRow = rows.find((r) => r.token === dto.toToken);

      if (!fromRow || !toRow) {
        await tx.swapRequest.update({
          where: { id: swapReq.id },
          data: { status: "FAILED", error: "balance row missing", processedAt: new Date() },
        });
        return { kind: "ERROR" as const, status: 500, message: "balance row missing" };
      }

      const fromBefore = new Prisma.Decimal(fromRow.amount);
      const toBefore = new Prisma.Decimal(toRow.amount);

      if (fromBefore.lt(amount)) {
        await tx.swapRequest.update({
          where: { id: swapReq.id },
          data: { status: "FAILED", error: "insufficient balance", processedAt: new Date() },
        });
        return { kind: "ERROR" as const, status: 400, message: "insufficient balance" };
      }

      const fromAfter = fromBefore.minus(amount);
      const toAfterGross = toBefore.plus(grossDest);
      const toAfter = toAfterGross.minus(feeDest);

      await tx.balance.update({ where: { id: fromRow.id }, data: { amount: fromAfter } });
      await tx.balance.update({ where: { id: toRow.id }, data: { amount: toAfter } });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.SWAP,
          fromToken: dto.fromToken,
          toToken: dto.toToken,
          amount,
          feeAmount: feeDest,
        },
        select: { id: true },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          transactionId: transaction.id,
          type: LedgerType.SWAP_OUT,
          token: dto.fromToken,
          amount: amount.mul(-1),
          previousBalance: fromBefore,
          newBalance: fromAfter,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          transactionId: transaction.id,
          type: LedgerType.SWAP_IN,
          token: dto.toToken,
          amount: grossDest,
          previousBalance: toBefore,
          newBalance: toAfterGross,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          transactionId: transaction.id,
          type: LedgerType.SWAP_FEE,
          token: dto.toToken,
          amount: feeDest.mul(-1),
          previousBalance: toAfterGross,
          newBalance: toAfter,
        },
      });

      await tx.swapRequest.update({
        where: { id: swapReq.id },
        data: { status: "PROCESSED", processedAt: new Date(), transactionId: transaction.id },
      });

      return {
        kind: "OK" as const,
        transactionId: transaction.id,
        processedAt: new Date(),
        rateUsed: calc.rate.toString(),
        grossAmount: grossDest.toString(),
        fee: feeDest.toString(),
        netAmount: netDest.toString(),
      };
    });

    if (result.kind === "REPLAY") {
      return {
        status: 200,
        body: {
          message: "already processed",
          idempotencyKey: dto.idempotencyKey,
          transactionId: result.transactionId,
          processedAt: result.processedAt,
        },
      };
    }

    if (result.kind === "ERROR")
      return { status: result.status, body: { message: result.message } };

    return {
      status: 201,
      body: {
        message: "swap executed",
        idempotencyKey: dto.idempotencyKey,
        transactionId: result.transactionId,
        rateUsed: result.rateUsed,
        grossAmount: result.grossAmount,
        fee: result.fee,
        netAmount: result.netAmount,
      },
    };
  } catch (e: any) {
    if (e?.code === "P2002") {
      const existing = await prisma.swapRequest.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        select: { status: true, transactionId: true, processedAt: true },
      });

      if (existing?.status === "PROCESSED") {
        return {
          status: 200,
          body: {
            message: "already processed",
            idempotencyKey: dto.idempotencyKey,
            transactionId: existing.transactionId,
            processedAt: existing.processedAt,
          },
        };
      }

      return { status: 409, body: { message: "swap is being processed" } };
    }

    return { status: 500, body: { message: "internal error" } };
  }
}