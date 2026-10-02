-- AlterEnum
CREATE TYPE "CampaignLeadStatus" AS ENUM (
  'QUEUED',
  'SCHEDULED',
  'SENT',
  'REPLIED',
  'FOLLOW_UP_DUE',
  'BOUNCED',
  'UNSUBSCRIBED',
  'COMPLETED',
  'PAUSED'
);

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "lead_status" "CampaignLeadStatus";

-- CreateIndex
CREATE INDEX "leads_lead_status_idx" ON "leads"("lead_status");
