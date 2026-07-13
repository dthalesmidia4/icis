ALTER PUBLICATION supabase_realtime ADD TABLE public.period_plans;
ALTER TABLE public.period_plans REPLICA IDENTITY FULL;