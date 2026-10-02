-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "audience" JSONB,
ADD COLUMN     "calendar_link" TEXT,
ADD COLUMN     "mailbox" TEXT,
ADD COLUMN     "schedule" JSONB;

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_status_idx" ON "campaigns"("workspace_id", "status");
