
ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS is_daily_card boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_start_date date,
  ADD COLUMN IF NOT EXISTS daily_end_date date,
  ADD COLUMN IF NOT EXISTS daily_time text,
  ADD COLUMN IF NOT EXISTS daily_exclude_weekends boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_exclude_holidays boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_total_occurrences integer,
  ADD COLUMN IF NOT EXISTS daily_completed_occurrences integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_next_date date,
  ADD COLUMN IF NOT EXISTS daily_completed_dates jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_demands_is_daily_card ON public.demands(is_daily_card) WHERE is_daily_card = true;
CREATE INDEX IF NOT EXISTS idx_demands_daily_next_date ON public.demands(daily_next_date) WHERE is_daily_card = true;
