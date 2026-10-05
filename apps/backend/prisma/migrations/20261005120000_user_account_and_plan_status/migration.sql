-- Account access and plan purchase, managed from the admin user panel.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "PlanStatus" AS ENUM ('PURCHASED', 'NOT_PURCHASED');

ALTER TABLE "users" ADD COLUMN "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN "plan_status" "PlanStatus" NOT NULL DEFAULT 'NOT_PURCHASED';
ALTER TABLE "users" ADD COLUMN "plan_name" TEXT;

CREATE INDEX "users_account_status_idx" ON "users"("account_status");
CREATE INDEX "users_plan_status_idx" ON "users"("plan_status");
