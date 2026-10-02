-- AlterTable
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "bounce_type" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "complaint_reason" TEXT;
