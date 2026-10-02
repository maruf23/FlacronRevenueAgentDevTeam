-- AlterTable
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "campaign_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_campaign_id_idx" ON "messages"("campaign_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_campaign_id_fkey'
  ) THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_campaign_id_fkey"
      FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
