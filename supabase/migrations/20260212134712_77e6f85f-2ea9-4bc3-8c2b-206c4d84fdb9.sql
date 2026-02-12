
-- Migração 2: Atualizar RPCs que escrevem/leem client_demand_template_stats

-- 2a. Atualizar create_demand_from_template
CREATE OR REPLACE FUNCTION public.create_demand_from_template(
  p_client_id uuid, 
  p_template_id uuid DEFAULT NULL, 
  p_pipeline_id uuid DEFAULT NULL, 
  p_status_id uuid DEFAULT NULL, 
  p_title text DEFAULT NULL, 
  p_description text DEFAULT NULL, 
  p_demand_type text DEFAULT NULL, 
  p_channel text DEFAULT NULL, 
  p_publish_date date DEFAULT NULL, 
  p_due_date date DEFAULT NULL, 
  p_period_plan_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_demand_id uuid;
  v_pipeline_id uuid;
  v_status_id uuid;
  v_required_fields jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;
  
  IF NOT public.can_create_demands(v_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para criar demandas');
  END IF;
  
  v_pipeline_id := p_pipeline_id;
  v_status_id := p_status_id;
  
  IF v_pipeline_id IS NULL THEN
    SELECT id INTO v_pipeline_id FROM public.pipelines
    WHERE tenant_id = v_tenant_id AND is_default = true LIMIT 1;
    IF v_pipeline_id IS NULL THEN
      SELECT id INTO v_pipeline_id FROM public.pipelines
      WHERE tenant_id = v_tenant_id ORDER BY position LIMIT 1;
    END IF;
  END IF;
  
  IF v_pipeline_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum pipeline encontrado.');
  END IF;
  
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id FROM public.pipeline_statuses
    WHERE pipeline_id = v_pipeline_id AND is_initial = true LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM public.pipeline_statuses
      WHERE pipeline_id = v_pipeline_id ORDER BY position LIMIT 1;
    END IF;
  END IF;
  
  IF v_status_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum status encontrado para o pipeline.');
  END IF;
  
  SELECT requires_fields INTO v_required_fields
  FROM public.pipeline_statuses WHERE id = v_status_id;
  
  IF v_required_fields IS NOT NULL AND jsonb_array_length(v_required_fields) > 0 THEN
    IF 'publish_date' = ANY(SELECT jsonb_array_elements_text(v_required_fields)) AND p_publish_date IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Data de publicação obrigatória para este status');
    END IF;
    IF 'description' = ANY(SELECT jsonb_array_elements_text(v_required_fields)) AND (p_description IS NULL OR p_description = '') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Descrição obrigatória para este status');
    END IF;
  END IF;
  
  INSERT INTO public.demands (
    tenant_id, client_id, pipeline_id, status_id, period_plan_id,
    title, description, demand_type, channel, publish_date, due_date,
    template_id, source, created_by
  ) VALUES (
    v_tenant_id, p_client_id, v_pipeline_id, v_status_id, p_period_plan_id,
    COALESCE(p_title, 'Nova Demanda'), p_description, p_demand_type, p_channel,
    p_publish_date, p_due_date, p_template_id,
    CASE WHEN p_template_id IS NOT NULL THEN 'template' ELSE 'manual' END,
    auth.uid()
  ) RETURNING id INTO v_demand_id;
  
  -- Atualizar stats diretamente na tabela de templates (sem tabela separada)
  IF p_template_id IS NOT NULL THEN
    UPDATE public.client_demand_templates
    SET times_used = times_used + 1, last_used_at = now()
    WHERE id = p_template_id;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'demand_id', v_demand_id);
END;
$function$;

-- 2b. Atualizar refresh_client_templates
CREATE OR REPLACE FUNCTION public.refresh_client_templates(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_pipeline_id uuid;
  v_status_id uuid;
  v_pattern RECORD;
  v_template_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;
  
  IF NOT public.can_create_demands(v_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  
  SELECT id INTO v_pipeline_id FROM public.pipelines
  WHERE tenant_id = v_tenant_id AND is_default = true LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    SELECT id INTO v_pipeline_id FROM public.pipelines
    WHERE tenant_id = v_tenant_id ORDER BY position LIMIT 1;
  END IF;
  
  IF v_pipeline_id IS NOT NULL THEN
    SELECT id INTO v_status_id FROM public.pipeline_statuses
    WHERE pipeline_id = v_pipeline_id AND is_initial = true LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM public.pipeline_statuses
      WHERE pipeline_id = v_pipeline_id ORDER BY position LIMIT 1;
    END IF;
  END IF;
  
  FOR v_pattern IN
    SELECT 
      demand_type, channel,
      EXTRACT(DOW FROM publish_date)::int as weekday,
      COUNT(*) as occurrences,
      MAX(created_at) as last_seen
    FROM public.demands
    WHERE client_id = p_client_id
      AND created_at > now() - interval '90 days'
      AND demand_type IS NOT NULL
    GROUP BY demand_type, channel, EXTRACT(DOW FROM publish_date)::int
    HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC
    LIMIT 10
  LOOP
    SELECT id INTO v_template_id FROM public.client_demand_templates
    WHERE client_id = p_client_id
      AND demand_type = v_pattern.demand_type
      AND COALESCE(channel, '') = COALESCE(v_pattern.channel, '')
      AND source = 'learned';
    
    IF v_template_id IS NOT NULL THEN
      UPDATE public.client_demand_templates
      SET 
        default_publish_weekday = v_pattern.weekday,
        recurrence_hint = CASE 
          WHEN v_pattern.occurrences >= 8 THEN 'semanal'
          WHEN v_pattern.occurrences >= 4 THEN 'quinzenal'
          ELSE 'mensal'
        END,
        score = v_pattern.occurrences * 10 + EXTRACT(EPOCH FROM (now() - v_pattern.last_seen)) / 86400,
        times_matched = v_pattern.occurrences,
        last_matched_at = now(),
        updated_at = now()
      WHERE id = v_template_id;
    ELSIF v_pipeline_id IS NOT NULL AND v_status_id IS NOT NULL THEN
      INSERT INTO public.client_demand_templates (
        tenant_id, client_id, pipeline_id, status_id,
        title_template, demand_type, channel, default_publish_weekday,
        recurrence_hint, score, source
      ) VALUES (
        v_tenant_id, p_client_id, v_pipeline_id, v_status_id,
        v_pattern.demand_type || ' - ' || COALESCE(v_pattern.channel, 'Geral'),
        v_pattern.demand_type, v_pattern.channel, v_pattern.weekday,
        CASE 
          WHEN v_pattern.occurrences >= 8 THEN 'semanal'
          WHEN v_pattern.occurrences >= 4 THEN 'quinzenal'
          ELSE 'mensal'
        END,
        v_pattern.occurrences * 10, 'learned'
      );
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'message', 'Templates atualizados');
END;
$function$;

-- 2c. Atualizar get_client_demand_suggestions (remover LEFT JOIN com stats)
CREATE OR REPLACE FUNCTION public.get_client_demand_suggestions(p_client_id uuid, p_limit integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_strategy_snippet text;
  v_result jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;
  
  IF NOT (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), v_tenant_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  
  SELECT LEFT(strategy_text, 200) INTO v_strategy_snippet
  FROM public.strategies
  WHERE company_id = p_client_id AND status = 'Ativa'
  ORDER BY created_at DESC LIMIT 1;
  
  -- Lê times_used diretamente de client_demand_templates (sem JOIN com stats)
  SELECT jsonb_build_object(
    'success', true,
    'strategy_snippet', COALESCE(v_strategy_snippet, ''),
    'suggestions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'title_template', t.title_template,
            'instructions_template', t.instructions_template,
            'demand_type', t.demand_type,
            'channel', t.channel,
            'pipeline_id', t.pipeline_id,
            'status_id', t.status_id,
            'default_publish_weekday', t.default_publish_weekday,
            'default_due_offset_days', t.default_due_offset_days,
            'recurrence_hint', t.recurrence_hint,
            'score', t.score,
            'source', t.source,
            'times_used', t.times_used,
            'suggested_publish_date', CASE 
              WHEN t.default_publish_weekday IS NOT NULL THEN
                CURRENT_DATE + ((t.default_publish_weekday - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7)
              ELSE NULL
            END
          ) ORDER BY t.score DESC
        )
        FROM public.client_demand_templates t
        WHERE t.client_id = p_client_id
        LIMIT p_limit
      ),
      '[]'::jsonb
    )
  ) INTO v_result;
  
  IF (v_result->'suggestions')::jsonb = '[]'::jsonb THEN
    SELECT jsonb_build_object(
      'success', true,
      'strategy_snippet', COALESCE(v_strategy_snippet, ''),
      'suggestions', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', t.id,
              'title_template', t.title_template,
              'instructions_template', t.instructions_template,
              'demand_type', t.demand_type,
              'channel', t.channel,
              'pipeline_id', t.pipeline_id,
              'status_id', t.status_id,
              'default_publish_weekday', t.default_publish_weekday,
              'recurrence_hint', t.recurrence_hint,
              'score', t.score,
              'source', t.source,
              'times_used', 0,
              'suggested_publish_date', NULL
            ) ORDER BY t.score DESC
          )
          FROM public.client_demand_templates t
          WHERE t.tenant_id = v_tenant_id AND t.source = 'seed'
          LIMIT p_limit
        ),
        '[]'::jsonb
      )
    ) INTO v_result;
  END IF;
  
  RETURN v_result;
END;
$function$;
