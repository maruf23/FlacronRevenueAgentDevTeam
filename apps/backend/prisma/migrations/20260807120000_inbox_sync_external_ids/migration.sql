-- Inbox sync: AI draft statuses, external message id, provider thread mapping
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'AI_SUGGESTED';
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'EDITED_BY_USER';

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "provider_thread_id" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" "EmailProvider";

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_workspace_id_provider_thread_id_key"
  ON "conversations"("workspace_id", "provider_thread_id");

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "external_message_id" TEXT;

-- Backfill from legacy errorMessage stash: external:{id}
UPDATE "messages"
SET "external_message_id" = SUBSTRING("error_message" FROM 10)
WHERE "external_message_id" IS NULL
  AND "error_message" LIKE 'external:%';

CREATE UNIQUE INDEX IF NOT EXISTS "messages_workspace_id_external_message_id_key"
  ON "messages"("workspace_id", "external_message_id");
