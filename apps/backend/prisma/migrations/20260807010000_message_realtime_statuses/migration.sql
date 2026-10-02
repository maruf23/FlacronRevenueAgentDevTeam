-- Real-time delivery statuses + provider correlation fields
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "suggested_pipeline_stage" TEXT;

CREATE INDEX IF NOT EXISTS "messages_provider_message_id_idx" ON "messages"("provider_message_id");
