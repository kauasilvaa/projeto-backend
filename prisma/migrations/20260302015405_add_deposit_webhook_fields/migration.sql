/*
  Warnings:

  - Added the required column `updatedAt` to the `DepositWebhook` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "DepositWebhook" ADD COLUMN     "error" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "requestBody" JSONB,
ADD COLUMN     "requestHeaders" JSONB,
ADD COLUMN     "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "transactionId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "DepositWebhook_status_createdAt_idx" ON "DepositWebhook"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DepositWebhook_transactionId_idx" ON "DepositWebhook"("transactionId");

-- AddForeignKey
ALTER TABLE "DepositWebhook" ADD CONSTRAINT "DepositWebhook_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
