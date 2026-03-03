import { z } from "zod";

export const depositWebhookSchema = z.object({
  userId: z.string().min(1),
  token: z.enum(["BRL", "BTC", "ETH"]),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  idempotencyKey: z.string().min(8).max(120),
});

export type DepositWebhookInput = z.infer<typeof depositWebhookSchema>;