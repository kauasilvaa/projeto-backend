import { z } from "zod";

export const ledgerQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  token: z.enum(["BRL", "BTC", "ETH"]).optional(),
  type: z.enum(["DEPOSIT", "SWAP_IN", "SWAP_OUT", "SWAP_FEE", "WITHDRAWAL"]).optional(),
});

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;