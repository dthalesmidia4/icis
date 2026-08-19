-- ============================================================
-- EXECUÇÃO OPERACIONAL POR PASSAGEM (aba "Execução" do card)
-- Semântica separada de "Alterações" (retrabalho).
-- ============================================================

CREATE TABLE public.demand_execution_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  demand_id uuid NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  function_key text,
  demand_type_key text,
  assigned_to uuid,
  pass_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT demand_execution_runs_status_check
    CHECK (status IN ('active', 'completed', 'completed_with_pending', 'superseded', 'cancelled')),
  CONSTRAINT demand_execution_runs_pass_check CHECK (pass_number >= 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_execution_runs TO authenticated;
GRANT ALL ON public.demand_execution_runs TO service_role;

ALTER TABLE public.demand_execution_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution runs select by tenant access"
  ON public.demand_execution_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "execution runs insert by tenant access"
  ON public.demand_execution_runs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "execution runs update by tenant access"
  ON public.demand_execution_runs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "execution runs delete by tenant access"
  ON public.demand_execution_runs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

-- No máximo UM run ativo por demanda (protege contra corrida de criação).
CREATE UNIQUE INDEX demand_execution_runs_one_active_per_demand
  ON public.demand_execution_runs (demand_id) WHERE status = 'active';
CREATE INDEX demand_execution_runs_tenant_idx ON public.demand_execution_runs (tenant_id);
CREATE INDEX demand_execution_runs_demand_idx ON public.demand_execution_runs (demand_id, created_at DESC);
CREATE INDEX demand_execution_runs_status_idx ON public.demand_execution_runs (tenant_id, status);
CREATE INDEX demand_execution_runs_function_idx ON public.demand_execution_runs (demand_id, function_key);
CREATE INDEX demand_execution_runs_assigned_idx ON public.demand_execution_runs (tenant_id, assigned_to);

CREATE TRIGGER demand_execution_runs_updated_at
  BEFORE UPDATE ON public.demand_execution_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.demand_execution_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_run_id uuid NOT NULL REFERENCES public.demand_execution_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  completed_by uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_execution_items TO authenticated;
GRANT ALL ON public.demand_execution_items TO service_role;

ALTER TABLE public.demand_execution_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution items select by tenant access"
  ON public.demand_execution_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "execution items insert by tenant access"
  ON public.demand_execution_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "execution items update by tenant access"
  ON public.demand_execution_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "execution items delete by tenant access"
  ON public.demand_execution_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX demand_execution_items_run_idx ON public.demand_execution_items (execution_run_id, position);
CREATE INDEX demand_execution_items_tenant_idx ON public.demand_execution_items (tenant_id);
CREATE INDEX demand_execution_items_pending_idx ON public.demand_execution_items (execution_run_id) WHERE is_completed = false;

CREATE TRIGGER demand_execution_items_updated_at
  BEFORE UPDATE ON public.demand_execution_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_execution_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_execution_items;


-- ============================================================
-- TROCA ATÔMICA DE TIPO + ETAPA (long-press na Visão Geral)
-- Um único UPDATE condicionado ao estado esperado (compare-and-set):
-- nunca existe estado intermediário "tipo novo + etapa antiga".
-- ============================================================
CREATE OR REPLACE FUNCTION public.change_demand_type_and_stage(
  p_demand_id uuid,
  p_next_type_key text,
  p_next_function_key text,
  p_next_assigned_to uuid,
  p_expected_type_key text,
  p_expected_function_key text,
  p_expected_assigned_to uuid,
  p_next_type_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.demands;
BEGIN
  UPDATE public.demands d
     SET demand_type_key = p_next_type_key,
         demand_type = COALESCE(p_next_type_label, d.demand_type),
         current_function_key = p_next_function_key,
         assigned_to = p_next_assigned_to,
         updated_at = now()
   WHERE d.id = p_demand_id
     AND COALESCE(d.demand_type_key, '') = COALESCE(p_expected_type_key, '')
     AND COALESCE(d.current_function_key, '') = COALESCE(p_expected_function_key, '')
     AND d.assigned_to IS NOT DISTINCT FROM p_expected_assigned_to
  RETURNING d.* INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status', 'stale');
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'demand_type_key', v_row.demand_type_key,
    'current_function_key', v_row.current_function_key,
    'assigned_to', v_row.assigned_to,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_demand_type_and_stage(uuid, text, text, uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_demand_type_and_stage(uuid, text, text, uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_demand_type_and_stage(uuid, text, text, uuid, text, text, uuid, text) TO service_role;