import { prisma } from "../../lib/prisma";
import { LedgerType, Token } from "@prisma/client";

type GetLedgerDTO = {
  userId: string;
  take: number;
  cursor?: string;
  token?: Token;
  type?: LedgerType;
};

export async function getLedger(dto: GetLedgerDTO) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: dto.userId },
    select: { id: true },
  });

  if (!wallet) {
    return { status: 404 as const, body: { message: "wallet not found" } };
  }

  const where: any = { walletId: wallet.id };

  if (dto.token) where.token = dto.token;
  if (dto.type) where.type = dto.type;

  const items = await prisma.ledgerEntry.findMany({
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