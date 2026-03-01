import { prisma } from "../../lib/prisma";
import { HttpError } from "../../http/http-error";

export async function getWalletBalances(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      balances: true,
    },
  });

  if (!wallet) throw new HttpError(404, "Wallet not found");

  return wallet.balances.map((b) => ({
    token: b.token,
    amount: b.amount,
  }));
}