
ALTER TABLE demands ADD COLUMN archived_at TIMESTAMPTZ NULL;
CREATE INDEX idx_demands_tenant_archived ON demands (tenant_id, archived_at);
