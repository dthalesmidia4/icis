ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS demands_is_draft_idx ON public.demands (tenant_id) WHERE is_draft = true;