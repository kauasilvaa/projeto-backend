import { prisma } from "../../lib/prisma";
import { Prisma, LedgerType, TransactionType, WebhookStatus, Token } from "@prisma/client";

type DepositWebhookDTO = {
  userId: string;
  token: Token;
  amount: string;
  idempotencyKey: string;
  requestBody?: unknown;
  requestHeaders?: unknown;
};

export async function handleDepositWebhook(dto: DepositWebhookDTO) {
  const amount = new Prisma.Decimal(dto.amount);

  if (amount.lte(0)) {
    return { status: 400, body: { message: "amount must be > 0" } };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.depositWebhook.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existing?.status === WebhookStatus.PROCESSED) {
        return { kind: "REPLAY" as const, webhook: existing };
      }

      const webhook =
        existing ??
        (await tx.depositWebhook.create({
          data: {
            idempotencyKey: dto.idempotencyKey,
            userId: dto.userId,
            token: dto.token,
            amount,
            status: WebhookStatus.RECEIVED,
            requestBody: dto.requestBody as any,
            requestHeaders: dto.requestHeaders as any,
          },
        }));

      const wallet = await tx.wallet.findUnique({
        where: { userId: dto.userId },
        select: { id: true },
      });

      if (!wallet) {
        await tx.depositWebhook.update({
          where: { id: webhook.id },
          data: { status: WebhookStatus.FAILED, error: "user/wallet not found", processedAt: new Date() },
        });
        return { kind: "ERROR" as const, status: 404, message: "user not found" };
      }

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

      const balanceRow = rows[0];

      if (!balanceRow) {
        await tx.depositWebhook.update({
          where: { id: webhook.id },
          data: { status: WebhookStatus.FAILED, error: "balance row missing", processedAt: new Date() },
        });
        return { kind: "ERROR" as const, status: 500, message: "balance row missing" };
      }

      const previousBalance = new Prisma.Decimal(balanceRow.amount);
      const newBalance = previousBalance.plus(amount);

      await tx.balance.update({
        where: { id: balanceRow.id },
        data: { amount: newBalance },
      });

      const transaction = await tx.transaction.create({
        data: { walletId: wallet.id, type: TransactionType.DEPOSIT, amount },
        select: { id: true },
      });

      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          transactionId: transaction.id,
          type: LedgerType.DEPOSIT,
          token: dto.token,
          amount,
          previousBalance,
          newBalance,
        },
        select: { id: true },
      });

      const done = await tx.depositWebhook.update({
        where: { id: webhook.id },
        data: { status: WebhookStatus.PROCESSED, processedAt: new Date(), transactionId: transaction.id },
      });

      return {
        kind: "OK" as const,
        webhook: done,
        transactionId: transaction.id,
        ledgerEntryId: ledgerEntry.id,
        balance: { previousBalance: previousBalance.toString(), newBalance: newBalance.toString() },
      };
    });

    if (result.kind === "REPLAY") {
      return {
        status: 200,
        body: {
          message: "already processed",
          idempotencyKey: result.webhook.idempotencyKey,
          transactionId: result.webhook.transactionId,
          processedAt: result.webhook.processedAt,
        },
      };
    }

    if (result.kind === "ERROR") {
      return { status: result.status, body: { message: result.message } };
    }

    return {
      status: 201,
      body: {
        message: "deposit processed",
        idempotencyKey: result.webhook.idempotencyKey,
        transactionId: result.transactionId,
        ledgerEntryId: result.ledgerEntryId,
        balance: result.balance,
      },
    };
  } catch (e: any) {
    if (e?.code === "P2002") {
      const existing = await prisma.depositWebhook.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existing?.status === WebhookStatus.PROCESSED) {
        return {
          status: 200,
          body: {
            message: "already processed",
            idempotencyKey: existing.idempotencyKey,
            transactionId: existing.transactionId,
            processedAt: existing.processedAt,
          },
        };
      }

      return { status: 409, body: { message: "deposit is being processed" } };
    }

    return { status: 500, body: { message: "internal error" } };
  }
}