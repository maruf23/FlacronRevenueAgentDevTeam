-- Rename email verification enum: EmailVerificationStatus → VerificationStatus
-- Map VALID → VERIFIED without dropping contact data.

CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'RISKY', 'CATCH_ALL', 'INVALID');

ALTER TABLE "contacts"
  ALTER COLUMN "verification_status" DROP DEFAULT;

ALTER TABLE "contacts"
  ALTER COLUMN "verification_status" TYPE "VerificationStatus"
  USING (
    CASE ("verification_status"::text)
      WHEN 'VALID' THEN 'VERIFIED'::"VerificationStatus"
      WHEN 'PENDING' THEN 'PENDING'::"VerificationStatus"
      WHEN 'RISKY' THEN 'RISKY'::"VerificationStatus"
      WHEN 'CATCH_ALL' THEN 'CATCH_ALL'::"VerificationStatus"
      WHEN 'INVALID' THEN 'INVALID'::"VerificationStatus"
      ELSE 'PENDING'::"VerificationStatus"
    END
  );

ALTER TABLE "contacts"
  ALTER COLUMN "verification_status" SET DEFAULT 'PENDING'::"VerificationStatus";

DROP TYPE "EmailVerificationStatus";

-- Expand LeadStatus to the 14-step pipeline
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'ENRICHED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'ENGAGED';

-- New detailed Lead fields
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lead_score" INTEGER;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "industry" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "next_recommended_action" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "campaign_id" UUID;

CREATE INDEX IF NOT EXISTS "leads_campaign_id_idx" ON "leads"("campaign_id");
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads"("status");
CREATE INDEX IF NOT EXISTS "leads_last_activity_at_idx" ON "leads"("last_activity_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_campaign_id_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_campaign_id_fkey"
      FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
