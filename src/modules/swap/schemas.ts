import { z } from "zod";

export const swapQuoteSchema = z.object({
  fromToken: z.enum(["BRL", "BTC", "ETH"]),
  toToken: z.enum(["BRL", "BTC", "ETH"]),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

export const swapExecuteSchema = z.object({
  fromToken: z.enum(["BRL", "BTC", "ETH"]),
  toToken: z.enum(["BRL", "BTC", "ETH"]),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  idempotencyKey: z.string().min(8).max(120),
});

export type SwapQuoteInput = z.infer<typeof swapQuoteSchema>;
export type SwapExecuteInput = z.infer<typeof swapExecuteSchema>;