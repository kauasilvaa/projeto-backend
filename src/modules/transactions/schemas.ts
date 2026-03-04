import { z } from "zod";

export const withdrawSchema = z.object({
  token: z.enum(["BRL", "BTC", "ETH"]),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  idempotencyKey: z.string().min(8).max(120),
});

export type WithdrawInput = z.infer<typeof withdrawSchema>;

export const transactionsQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  type: z.enum(["DEPOSIT", "SWAP", "WITHDRAWAL"]).optional(),
});     

export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;