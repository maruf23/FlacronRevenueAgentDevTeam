-- Add import job source (HUNTER replaces planned APOLLO) and index lead source.

ALTER TABLE "lead_import_jobs" ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE INDEX IF NOT EXISTS "lead_import_jobs_source_idx" ON "lead_import_jobs"("source");
CREATE INDEX IF NOT EXISTS "leads_source_idx" ON "leads"("source");
