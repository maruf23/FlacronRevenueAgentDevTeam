-- AlterEnum
ALTER TYPE "LeadStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "LeadStatus" ADD VALUE 'COMPLAINED';

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "SequenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'BOUNCED', 'COMPLAINED', 'FAILED');
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'MICROSOFT');
CREATE TYPE "SuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "step_order" JSONB NOT NULL,
    "status" "SequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "sequence_step" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "draft_id" UUID,
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "provider" "EmailProvider",
    "error_message" TEXT,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "EmailProvider" NOT NULL,
    "account_email" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppression_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suppression_entries_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "campaigns_workspace_id_idx" ON "campaigns"("workspace_id");
CREATE INDEX "sequences_workspace_id_idx" ON "sequences"("workspace_id");
CREATE INDEX "sequences_campaign_id_idx" ON "sequences"("campaign_id");
CREATE INDEX "messages_workspace_id_idx" ON "messages"("workspace_id");
CREATE INDEX "messages_lead_id_idx" ON "messages"("lead_id");
CREATE INDEX "messages_status_scheduled_at_idx" ON "messages"("status", "scheduled_at");
CREATE INDEX "email_integrations_workspace_id_idx" ON "email_integrations"("workspace_id");
CREATE UNIQUE INDEX "email_integrations_workspace_id_provider_key" ON "email_integrations"("workspace_id", "provider");
CREATE INDEX "suppression_entries_workspace_id_idx" ON "suppression_entries"("workspace_id");
CREATE UNIQUE INDEX "suppression_entries_workspace_id_email_key" ON "suppression_entries"("workspace_id", "email");

-- FKs
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_integrations" ADD CONSTRAINT "email_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sequences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "email_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_integrations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "suppression_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppression_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY campaigns_tenant_isolation ON "campaigns" FOR ALL
  USING (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY sequences_tenant_isolation ON "sequences" FOR ALL
  USING (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY messages_tenant_isolation ON "messages" FOR ALL
  USING (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY email_integrations_tenant_isolation ON "email_integrations" FOR ALL
  USING (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY suppression_entries_tenant_isolation ON "suppression_entries" FOR ALL
  USING (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (COALESCE(current_setting('app.current_workspace_id', true), '') = '' OR workspace_id::text = current_setting('app.current_workspace_id', true));
