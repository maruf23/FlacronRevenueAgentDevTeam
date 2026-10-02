-- Prisma prefers updated_at without a DB-level default (handled by @updatedAt)
ALTER TABLE "tasks" ALTER COLUMN "updated_at" DROP DEFAULT;
