
CREATE TABLE IF NOT EXISTS public.scheduled_publication_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  created_by uuid,
  content_type text NOT NULL CHECK (content_type IN ('post','carrossel','video','video_capa')),
  scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  caption text,
  media_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_file jsonb,
  social_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','dispatching','published','failed','cancelled')),
  dispatched_at timestamptz,
  published_at timestamptz,
  error_message text,
  external_post_ids jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_publication_dispatches TO authenticated;
GRANT ALL ON public.scheduled_publication_dispatches TO service_role;

ALTER TABLE public.scheduled_publication_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view dispatches"
  ON public.scheduled_publication_dispatches FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert dispatches"
  ON public.scheduled_publication_dispatches FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update dispatches"
  ON public.scheduled_publication_dispatches FOR UPDATE
  TO authenticated
  USING (public.user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete dispatches"
  ON public.scheduled_publication_dispatches FOR DELETE
  TO authenticated
  USING (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX IF NOT EXISTS idx_spd_status_scheduled_at
  ON public.scheduled_publication_dispatches (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_spd_card_id
  ON public.scheduled_publication_dispatches (card_id);
CREATE INDEX IF NOT EXISTS idx_spd_client_scheduled
  ON public.scheduled_publication_dispatches (client_id, scheduled_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_spd_active_per_card
  ON public.scheduled_publication_dispatches (card_id)
  WHERE status IN ('scheduled','dispatching');

CREATE OR REPLACE FUNCTION public.spd_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spd_updated_at ON public.scheduled_publication_dispatches;
CREATE TRIGGER trg_spd_updated_at
  BEFORE UPDATE ON public.scheduled_publication_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.spd_set_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'run-scheduled-dispatches-every-minute';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'run-scheduled-dispatches-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://neriayolipcupycirwhf.supabase.co/functions/v1/run-scheduled-dispatches',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lcmlheW9saXBjdXB5Y2lyd2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxODkxODMsImV4cCI6MjA3Nzc2NTE4M30.a1zJzQXHqgNZzyWvMkMOi5R4pZAnhNlqfb1DhSZKNWE"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);
