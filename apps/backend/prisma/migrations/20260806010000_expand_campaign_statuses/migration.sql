-- Expand CampaignStatus for full campaign lifecycle
CREATE TYPE "CampaignStatus_new" AS ENUM (
  'DRAFT',
  'PREPARING',
  'NEEDS_REVIEW',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'ATTENTION_REQUIRED',
  'FAILED',
  'ARCHIVED'
);

ALTER TABLE "campaigns"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "campaigns"
  ALTER COLUMN "status" TYPE "CampaignStatus_new"
  USING (
    CASE "status"::text
      WHEN 'ACTIVE' THEN 'RUNNING'::"CampaignStatus_new"
      ELSE "status"::text::"CampaignStatus_new"
    END
  );

DROP TYPE "CampaignStatus";

ALTER TYPE "CampaignStatus_new" RENAME TO "CampaignStatus";

ALTER TABLE "campaigns"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"CampaignStatus";

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "goal" TEXT,
  ADD COLUMN IF NOT EXISTS "product" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_prompt" TEXT,
  ADD COLUMN IF NOT EXISTS "settings" JSONB;
