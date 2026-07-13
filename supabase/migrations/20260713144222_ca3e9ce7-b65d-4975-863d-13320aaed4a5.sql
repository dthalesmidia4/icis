ALTER PUBLICATION supabase_realtime ADD TABLE public.question_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.strategies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visual_identity_presets;
ALTER TABLE public.question_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.strategies REPLICA IDENTITY FULL;
ALTER TABLE public.visual_identity_presets REPLICA IDENTITY FULL;