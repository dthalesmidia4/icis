ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS classifications text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ad_plan jsonb NULL;