-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "SwapRequest" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "fromToken" "Token" NOT NULL,
    "toToken" "Token" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "rateUsed" DECIMAL(65,30),
    "grossAmount" DECIMAL(65,30),
    "feeAmount" DECIMAL(65,30),
    "netAmount" DECIMAL(65,30),
    "status" "OperationStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "requestBody" JSONB,
    "requestHeaders" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SwapRequest_idempotencyKey_key" ON "SwapRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SwapRequest_walletId_createdAt_idx" ON "SwapRequest"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "SwapRequest_userId_idx" ON "SwapRequest"("userId");

-- CreateIndex
CREATE INDEX "SwapRequest_status_createdAt_idx" ON "SwapRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SwapRequest_transactionId_idx" ON "SwapRequest"("transactionId");

-- AddForeignKey
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
