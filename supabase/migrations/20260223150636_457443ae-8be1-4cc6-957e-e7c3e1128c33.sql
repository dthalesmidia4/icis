
ALTER TABLE public.demands
ADD COLUMN additional_publish_dates jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.demands.additional_publish_dates IS 'Array of additional publish dates, e.g. ["2026-02-24","2026-02-25"]';
