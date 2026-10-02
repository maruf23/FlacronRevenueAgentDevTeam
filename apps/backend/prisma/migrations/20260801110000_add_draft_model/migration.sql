-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value_props" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "generated_subject" TEXT NOT NULL,
    "generated_body" TEXT NOT NULL,
    "user_edits" JSONB,
    "evidence_used" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_workspace_id_idx" ON "products"("workspace_id");

-- CreateIndex
CREATE INDEX "drafts_workspace_id_idx" ON "drafts"("workspace_id");

-- CreateIndex
CREATE INDEX "drafts_lead_id_idx" ON "drafts"("lead_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;

ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drafts" FORCE ROW LEVEL SECURITY;

CREATE POLICY products_tenant_isolation ON "products"
  FOR ALL
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );

CREATE POLICY drafts_tenant_isolation ON "drafts"
  FOR ALL
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );
