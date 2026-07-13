
-- Fase 0: Realtime publisher + REPLICA IDENTITY
-- Idempotente: só adiciona ao publisher se ainda não estiver.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'demands',
    'demand_flow_history',
    'flow_functions',
    'demand_type_flow_rules',
    'collaborator_function_assignments',
    'pipeline_statuses',
    'profiles',
    'user_roles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL nas tabelas em que precisamos do OLD em UPDATE/DELETE.
ALTER TABLE public.demands REPLICA IDENTITY FULL;
ALTER TABLE public.demand_flow_history REPLICA IDENTITY FULL;
