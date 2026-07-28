ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS client_wait_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_resend_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_last_resend_at timestamptz;

UPDATE public.demands
SET client_wait_started_at = updated_at
WHERE current_function_key = 'aguardando_cliente'
  AND client_wait_started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_demands_awaiting_client
  ON public.demands (tenant_id, current_function_key, client_wait_started_at)
  WHERE current_function_key = 'aguardando_cliente';