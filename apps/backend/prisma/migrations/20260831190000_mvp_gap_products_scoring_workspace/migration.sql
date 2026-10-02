-- Workspace autopilot / onboarding settings (Appendix D)
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "settings" JSONB;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3);

-- Product catalog enrichment (FR-003)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "audience_hints" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pricing_notes" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "qualification_rules" JSONB;

-- Lead scoring explanation + qualification worksheet (FR-010, FR-018)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "score_explanation" JSONB;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualification" JSONB;

-- Existing workspaces that already have products are treated as onboarded
UPDATE "workspaces" w
SET "onboarding_completed_at" = COALESCE(w."onboarding_completed_at", NOW())
WHERE w."onboarding_completed_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "products" p WHERE p."workspace_id" = w."id"
  );
