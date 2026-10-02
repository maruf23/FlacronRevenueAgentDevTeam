-- Row-Level Security for immutable audit trail
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_tenant_isolation ON "audit_events"
  FOR SELECT
  USING (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );

CREATE POLICY audit_events_tenant_isolation_insert ON "audit_events"
  FOR INSERT
  WITH CHECK (
    COALESCE(current_setting('app.current_workspace_id', true), '') = ''
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
  );

-- Audit rows are immutable — no UPDATE/DELETE policies for tenant roles
