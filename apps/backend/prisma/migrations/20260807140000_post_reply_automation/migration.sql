-- Post-reply automation: tasks, stage history, recommended response
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "recommended_response" TEXT;

CREATE TABLE IF NOT EXISTS "stage_histories" (
  "id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "from_status" "LeadStatus" NOT NULL,
  "to_status" "LeadStatus" NOT NULL,
  "reason" TEXT,
  "source" TEXT,
  "actor_user_id" UUID,
  "workspace_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stage_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stage_histories_workspace_id_created_at_idx"
  ON "stage_histories"("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "stage_histories_lead_id_created_at_idx"
  ON "stage_histories"("lead_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "stage_histories"
    ADD CONSTRAINT "stage_histories_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "stage_histories"
    ADD CONSTRAINT "stage_histories_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "due_at" TIMESTAMP(3),
  "lead_id" UUID,
  "conversation_id" UUID,
  "assigned_user_id" UUID,
  "workspace_id" UUID NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tasks_workspace_id_status_idx" ON "tasks"("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "tasks_assigned_user_id_idx" ON "tasks"("assigned_user_id");
CREATE INDEX IF NOT EXISTS "tasks_lead_id_idx" ON "tasks"("lead_id");
CREATE INDEX IF NOT EXISTS "tasks_due_at_idx" ON "tasks"("due_at");

DO $$ BEGIN
  ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_assigned_user_id_fkey"
    FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
