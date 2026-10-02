-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailVerificationStatus" AS ENUM ('PENDING', 'VALID', 'CATCH_ALL', 'INVALID', 'RISKY');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED');

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "company_name" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "verification_status" "EmailVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filename" TEXT NOT NULL,
    "total_records" INTEGER NOT NULL DEFAULT 0,
    "processed_records" INTEGER NOT NULL DEFAULT 0,
    "duplicate_records" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "lead_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "import_job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_workspace_id_idx" ON "contacts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_email_key" ON "contacts"("workspace_id", "email");

-- CreateIndex
CREATE INDEX "lead_import_jobs_workspace_id_idx" ON "lead_import_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "leads_workspace_id_idx" ON "leads"("workspace_id");

-- CreateIndex
CREATE INDEX "leads_contact_id_idx" ON "leads"("contact_id");

-- CreateIndex
CREATE INDEX "leads_import_job_id_idx" ON "leads"("import_job_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_jobs" ADD CONSTRAINT "lead_import_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "lead_import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;

ALTER TABLE "lead_import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_import_jobs" FORCE ROW LEVEL SECURITY;

CREATE POLICY contacts_tenant_isolation ON "contacts"
  FOR ALL
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );

CREATE POLICY leads_tenant_isolation ON "leads"
  FOR ALL
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );

CREATE POLICY lead_import_jobs_tenant_isolation ON "lead_import_jobs"
  FOR ALL
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );
