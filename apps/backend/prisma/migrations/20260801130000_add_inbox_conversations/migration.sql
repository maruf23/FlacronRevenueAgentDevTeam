-- AlterEnum LeadStatus
ALTER TYPE "LeadStatus" ADD VALUE 'REPLIED';
ALTER TYPE "LeadStatus" ADD VALUE 'MEETING_SCHEDULED';
ALTER TYPE "LeadStatus" ADD VALUE 'LOST';

-- AlterEnum MessageStatus
ALTER TYPE "MessageStatus" ADD VALUE 'RECEIVED';
ALTER TYPE "MessageStatus" ADD VALUE 'CANCELLED';

-- AlterEnum SuppressionReason
ALTER TYPE "SuppressionReason" ADD VALUE 'UNSUBSCRIBE';

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "ReplyIntent" AS ENUM ('MEETING_REQUEST', 'POSITIVE_INTEREST', 'PRICING_QUESTION', 'UNSUBSCRIBE', 'OBJECTION', 'OUT_OF_OFFICE', 'NEGATIVE', 'SPAM', 'UNKNOWN');
CREATE TYPE "ReplySentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- Lead assignee
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assigned_user_id" UUID;
CREATE INDEX IF NOT EXISTS "leads_assigned_user_id_idx" ON "leads"("assigned_user_id");
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_assigned_user_id_fkey";
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conversations
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "subject" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_preview" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_workspace_id_contact_id_lead_id_key" ON "conversations"("workspace_id", "contact_id", "lead_id");
CREATE INDEX "conversations_workspace_id_last_message_at_idx" ON "conversations"("workspace_id", "last_message_at");
CREATE INDEX "conversations_lead_id_idx" ON "conversations"("lead_id");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Message extensions
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "conversation_id" UUID;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "from_email" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "to_email" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND';
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "intent" "ReplyIntent";
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "sentiment" "ReplySentiment";
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ooo_return_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages"("conversation_id");
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_conversation_id_fkey";
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Notifications
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_workspace_id_created_at_idx" ON "notifications"("workspace_id", "created_at");
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY conversations_tenant_isolation ON "conversations" FOR ALL
  USING (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY notifications_tenant_isolation ON "notifications" FOR ALL
  USING (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true));
