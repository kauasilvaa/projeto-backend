import { prisma } from "../../lib/prisma";
import { Prisma, Token, TransactionType, LedgerType } from "@prisma/client";

type ExecuteWithdrawalDTO = {
  userId: string;
  token: Token;
  amount: string;
  idempotencyKey: string;
  requestBody?: unknown;
  requestHeaders?: unknown;
};

export async function executeWithdrawal(dto: ExecuteWithdrawalDTO) {
  const amount = new Prisma.Decimal(dto.amount);
  if (amount.lte(0)) return { status: 400, body: { message: "amount must be > 0" } };

  const wallet = await prisma.wallet.findUnique({
    where: { userId: dto.userId },
    select: { id: true },
  });

  if (!wallet) return { status: 404, body: { message: "user not found" } };

  const done = await prisma.withdrawalRequest.findUnique({
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawalRequest.findUnique({
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

      const withdrawReq =
        existing ??
        (await tx.withdrawalRequest.create({
          data: {
            idempotencyKey: dto.idempotencyKey,
            userId: dto.userId,
            walletId: wallet.id,
            token: dto.token,
            amount,
            status: "RECEIVED",
            requestBody: dto.requestBody as any,
            requestHeaders: dto.requestHeaders as any,
          },
          select: { id: true },
        }));

      await tx.balance.upsert({
        where: { walletId_token: { walletId: wallet.id, token: dto.token } },
        create: { walletId: wallet.id, token: dto.token, amount: new Prisma.Decimal(0) },
        update: {},
      });

      const rows = await tx.$queryRaw<Array<{ id: string; amount: string }>>`
        SELECT "id", "amount"
        FROM "Balance"
        WHERE "walletId" = ${wallet.id} AND "token" = ${dto.token}
        FOR UPDATE
      `;

      const balRow = rows[0];
      if (!balRow) {
        await tx.withdrawalRequest.update({
          where: { id: withdrawReq.id },
          data: { status: "FAILED", error: "balance row missing", processedAt: new Date() },
        });
        return { kind: "ERROR" as const, status: 500, message: "balance row missing" };
      }

      const before = new Prisma.Decimal(balRow.amount);

      if (before.lt(amount)) {
        await tx.withdrawalRequest.update({
          where: { id: withdrawReq.id },
          data: { status: "FAILED", error: "insufficient balance", processedAt: new Date() },
        });
        return { kind: "ERROR" as const, status: 400, message: "insufficient balance" };
      }

      const after = before.minus(amount);

      await tx.balance.update({
        where: { id: balRow.id },
        data: { amount: after },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.WITHDRAWAL,
          fromToken: dto.token,
          amount,
        },
        select: { id: true },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          transactionId: transaction.id,
          type: LedgerType.WITHDRAWAL,
          token: dto.token,
          amount: amount.mul(-1),
          previousBalance: before,
          newBalance: after,
        },
      });

      await tx.withdrawalRequest.update({
        where: { id: withdrawReq.id },
        data: { status: "PROCESSED", processedAt: new Date(), transactionId: transaction.id },
      });

      return {
        kind: "OK" as const,
        transactionId: transaction.id,
        processedAt: new Date(),
        token: dto.token,
        amount: amount.toString(),
        previousBalance: before.toString(),
        newBalance: after.toString(),
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

    if (result.kind === "ERROR") return { status: result.status, body: { message: result.message } };

    return {
      status: 201,
      body: {
        message: "withdrawal executed",
        idempotencyKey: dto.idempotencyKey,
        transactionId: result.transactionId,
        processedAt: result.processedAt,
        token: result.token,
        amount: result.amount,
        previousBalance: result.previousBalance,
        newBalance: result.newBalance,
      },
    };
  } catch (e: any) {
    if (e?.code === "P2002") {
      const existing = await prisma.withdrawalRequest.findUnique({
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

      return { status: 409, body: { message: "withdrawal is being processed" } };
    }

    return { status: 500, body: { message: "internal error" } };
  }
}

type GetTransactionsDTO = {
  userId: string;
  take: number;
  cursor?: string;
  type?: TransactionType;
};

export async function getTransactions(dto: GetTransactionsDTO) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: dto.userId },
    select: { id: true },
  });

  if (!wallet) {
    return { status: 404 as const, body: { message: "wallet not found" } };
  }

  const where: any = { walletId: wallet.id };
  if (dto.type) where.type = dto.type;

  const items = await prisma.transaction.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: dto.take + 1,
    ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
  });

  const hasNext = items.length > dto.take;
  const data = hasNext ? items.slice(0, dto.take) : items;

  const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].id : null;

  return {
    status: 200 as const,
    body: {
      items: data,
      nextCursor,
    },
  };
}