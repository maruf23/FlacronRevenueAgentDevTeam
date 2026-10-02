-- Drop legacy tenant scaffold
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "tenants" CASCADE;

-- Role enum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'SALES_REP');

-- Workspaces (tenant boundary)
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- Users
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SALES_REP',
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_workspace_id_idx" ON "users"("workspace_id");

ALTER TABLE "users"
  ADD CONSTRAINT "users_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Default UUID generation via Prisma @default(uuid()) — also set DB defaults for safety
ALTER TABLE "workspaces" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- ---------------------------------------------------------------------------
-- Row-Level Security keyed on app.current_workspace_id
-- Empty / unset setting allows bootstrap auth queries (login/register).
-- Authenticated requests set the GUC via RlsInterceptor.
-- ---------------------------------------------------------------------------

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY workspaces_tenant_isolation ON "workspaces"
  FOR ALL
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR id::text = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR id::text = current_setting('app.current_workspace_id', true)
  );

CREATE POLICY users_tenant_isolation ON "users"
  FOR ALL
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );
