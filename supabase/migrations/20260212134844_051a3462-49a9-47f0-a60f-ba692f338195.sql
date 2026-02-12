
-- Migração 4: Reescrever get_contextual_planning_input com agregações diretas
CREATE OR REPLACE FUNCTION public.get_contextual_planning_input(p_client_id uuid, p_period_start date, p_period_end date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_result JSONB;
  v_calendar_events JSONB;
  v_successful_patterns JSONB;
  v_failed_patterns JSONB;
  v_recent_fingerprints JSONB;
  v_top_demand_types JSONB;
  v_avoid_fingerprints JSONB;
  v_window_start TIMESTAMPTZ := now() - interval '120 days';
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  -- 1. DATAS COMEMORATIVAS (sem mudança)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', event_date, 'name', name, 'type', event_type,
      'priority', priority, 'tips', marketing_tips
    ) ORDER BY event_date
  ), '[]'::jsonb)
  INTO v_calendar_events
  FROM public.br_calendar_events
  WHERE event_date BETWEEN p_period_start AND p_period_end;

  -- 2. PADRÕES DE SUCESSO (agregação direta em demand_feedback_events)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type', pattern_type,
      'value', pattern_value,
      'success_rate', ROUND((success_count::NUMERIC / NULLIF(total_count, 0)) * 100, 1),
      'net_score', (success_count * 10) - (failure_count * 15)
    ) ORDER BY (success_count * 10 - failure_count * 15) DESC
  ), '[]'::jsonb)
  INTO v_successful_patterns
  FROM (
    -- Por demand_type
    SELECT 'demand_type' as pattern_type, demand_type as pattern_value,
      COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')) as success_count,
      COUNT(*) FILTER (WHERE event_type IN ('deleted', 'archived_without_publish')) as failure_count,
      COUNT(*) as total_count
    FROM public.demand_feedback_events
    WHERE client_id = p_client_id AND created_at >= v_window_start AND demand_type IS NOT NULL
    GROUP BY demand_type
    HAVING COUNT(*) >= 2
    UNION ALL
    -- Por channel
    SELECT 'channel', channel,
      COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')),
      COUNT(*) FILTER (WHERE event_type IN ('deleted', 'archived_without_publish')),
      COUNT(*)
    FROM public.demand_feedback_events
    WHERE client_id = p_client_id AND created_at >= v_window_start AND channel IS NOT NULL
    GROUP BY channel
    HAVING COUNT(*) >= 2
    UNION ALL
    -- Por weekday
    SELECT 'weekday', publish_weekday::TEXT,
      COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')),
      COUNT(*) FILTER (WHERE event_type IN ('deleted', 'archived_without_publish')),
      COUNT(*)
    FROM public.demand_feedback_events
    WHERE client_id = p_client_id AND created_at >= v_window_start AND publish_weekday IS NOT NULL
    GROUP BY publish_weekday
    HAVING COUNT(*) >= 2
  ) patterns
  WHERE success_count > failure_count
  LIMIT 15;

  -- 3. PADRÕES PROBLEMÁTICOS (agregação direta)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type', pattern_type,
      'value', pattern_value,
      'failure_rate', ROUND((failure_count::NUMERIC / NULLIF(total_count, 0)) * 100, 1)
    ) ORDER BY failure_count DESC
  ), '[]'::jsonb)
  INTO v_failed_patterns
  FROM (
    SELECT 'demand_type' as pattern_type, demand_type as pattern_value,
      COUNT(*) FILTER (WHERE event_type IN ('deleted', 'archived_without_publish')) as failure_count,
      COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')) as success_count,
      COUNT(*) as total_count
    FROM public.demand_feedback_events
    WHERE client_id = p_client_id AND created_at >= v_window_start AND demand_type IS NOT NULL
    GROUP BY demand_type
    HAVING COUNT(*) >= 2
    UNION ALL
    SELECT 'channel', channel,
      COUNT(*) FILTER (WHERE event_type IN ('deleted', 'archived_without_publish')),
      COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')),
      COUNT(*)
    FROM public.demand_feedback_events
    WHERE client_id = p_client_id AND created_at >= v_window_start AND channel IS NOT NULL
    GROUP BY channel
    HAVING COUNT(*) >= 2
  ) patterns
  WHERE failure_count > success_count
  LIMIT 10;

  -- 4. FINGERPRINTS RECENTES (sem mudança - usa demand_fingerprints)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fingerprint', fingerprint, 'title', title, 'was_successful', was_successful
    )
  ), '[]'::jsonb)
  INTO v_recent_fingerprints
  FROM public.demand_fingerprints
  WHERE client_id = p_client_id AND created_at > now() - interval '180 days'
  LIMIT 50;

  -- 5. TOP DEMAND TYPES (agregação direta)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('demand_type', demand_type, 'success_count', sc)
    ORDER BY sc DESC
  ), '[]'::jsonb)
  INTO v_top_demand_types
  FROM (
    SELECT demand_type, 
      COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')) as sc
    FROM public.demand_feedback_events
    WHERE client_id = p_client_id AND created_at >= v_window_start AND demand_type IS NOT NULL
    GROUP BY demand_type
    HAVING COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')) > 0
    ORDER BY sc DESC
    LIMIT 5
  ) top;

  -- 6. FINGERPRINTS A EVITAR (agregação direta)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fingerprint', demand_fingerprint,
      'reason', CASE 
        WHEN del_count >= 3 THEN 'deleted_multiple_times'
        WHEN del_count >= 2 THEN 'never_used'
        ELSE 'low_engagement'
      END
    )
  ), '[]'::jsonb)
  INTO v_avoid_fingerprints
  FROM (
    SELECT demand_fingerprint,
      COUNT(*) FILTER (WHERE event_type = 'deleted') as del_count,
      COUNT(*) FILTER (WHERE event_type IN ('published', 'scheduled')) as ok_count
    FROM public.demand_feedback_events
    WHERE client_id = p_client_id AND created_at >= v_window_start AND demand_fingerprint IS NOT NULL
    GROUP BY demand_fingerprint
    HAVING COUNT(*) FILTER (WHERE event_type = 'deleted') >= 2
  ) avoid
  WHERE del_count > ok_count
  LIMIT 20;

  -- MONTAR RESULTADO (mesmo contrato)
  v_result := jsonb_build_object(
    'success', true,
    'calendar_events', v_calendar_events,
    'successful_patterns', v_successful_patterns,
    'failed_patterns', v_failed_patterns,
    'recent_fingerprints', v_recent_fingerprints,
    'top_demand_types', v_top_demand_types,
    'avoid_fingerprints', v_avoid_fingerprints,
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end)
  );

  RETURN v_result;
END;
$function$;
