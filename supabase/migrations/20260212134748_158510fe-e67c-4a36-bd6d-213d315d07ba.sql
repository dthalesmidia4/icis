
-- Migração 3: Remover chamada ao calculate_pattern_scores de record_demand_feedback
CREATE OR REPLACE FUNCTION public.record_demand_feedback(p_demand_id uuid, p_event_type demand_feedback_event_type)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_demand RECORD;
  v_fingerprint TEXT;
  v_weekday INTEGER;
BEGIN
  SELECT d.id, d.tenant_id, d.client_id, d.title, d.demand_type, d.channel, d.publish_date
  INTO v_demand
  FROM public.demands d WHERE d.id = p_demand_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Demanda não encontrada');
  END IF;
  
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), v_demand.tenant_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  
  v_fingerprint := generate_demand_fingerprint(v_demand.title, v_demand.demand_type, v_demand.channel);
  
  v_weekday := CASE WHEN v_demand.publish_date IS NOT NULL 
    THEN EXTRACT(DOW FROM v_demand.publish_date)::INTEGER 
    ELSE NULL 
  END;
  
  INSERT INTO public.demand_feedback_events (
    tenant_id, client_id, demand_id, event_type,
    demand_fingerprint, demand_type, channel, title, publish_weekday
  ) VALUES (
    v_demand.tenant_id, v_demand.client_id, p_demand_id, p_event_type,
    v_fingerprint, v_demand.demand_type, v_demand.channel, v_demand.title, v_weekday
  );
  
  -- REMOVIDO: PERFORM calculate_pattern_scores(v_demand.client_id);
  
  RETURN jsonb_build_object('success', true, 'fingerprint', v_fingerprint);
END;
$function$;
