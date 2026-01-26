-- Atualizar função can_create_demands para incluir agency_admin
CREATE OR REPLACE FUNCTION public.can_create_demands(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    -- Super admin pode sempre
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR
    -- Agency admin pode na sua tenant
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND role = 'agency_admin'
    )
    OR
    -- Agency manager pode na sua tenant
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND role = 'agency_manager'
    )
$$;

-- Também atualizar refresh_client_templates para usar a mesma lógica
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
  -- Buscar tenant
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies
  WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;
  
  -- Verificar permissão (usando can_create_demands que agora inclui agency_admin)
  IF NOT public.can_create_demands(v_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  
  -- Buscar pipeline padrão
  SELECT id INTO v_pipeline_id
  FROM public.pipelines
  WHERE tenant_id = v_tenant_id AND is_default = true
  LIMIT 1;
  
  IF v_pipeline_id IS NULL THEN
    SELECT id INTO v_pipeline_id
    FROM public.pipelines
    WHERE tenant_id = v_tenant_id
    ORDER BY position
    LIMIT 1;
  END IF;
  
  -- Buscar status inicial
  IF v_pipeline_id IS NOT NULL THEN
    SELECT id INTO v_status_id
    FROM public.pipeline_statuses
    WHERE pipeline_id = v_pipeline_id AND is_initial = true
    LIMIT 1;
    
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id
      FROM public.pipeline_statuses
      WHERE pipeline_id = v_pipeline_id
      ORDER BY position
      LIMIT 1;
    END IF;
  END IF;
  
  -- Analisar padrões das últimas demandas (90 dias)
  FOR v_pattern IN
    SELECT 
      demand_type,
      channel,
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
    -- Verificar se já existe template similar
    SELECT id INTO v_template_id
    FROM public.client_demand_templates
    WHERE client_id = p_client_id
    AND demand_type = v_pattern.demand_type
    AND COALESCE(channel, '') = COALESCE(v_pattern.channel, '')
    AND source = 'learned';
    
    IF v_template_id IS NOT NULL THEN
      -- Atualizar template existente
      UPDATE public.client_demand_templates
      SET 
        default_publish_weekday = v_pattern.weekday,
        recurrence_hint = CASE 
          WHEN v_pattern.occurrences >= 8 THEN 'semanal'
          WHEN v_pattern.occurrences >= 4 THEN 'quinzenal'
          ELSE 'mensal'
        END,
        score = v_pattern.occurrences * 10 + EXTRACT(EPOCH FROM (now() - v_pattern.last_seen)) / 86400,
        updated_at = now()
      WHERE id = v_template_id;
      
      -- Atualizar times_matched
      UPDATE public.client_demand_template_stats
      SET times_matched = v_pattern.occurrences, last_matched_at = now()
      WHERE template_id = v_template_id;
    ELSIF v_pipeline_id IS NOT NULL AND v_status_id IS NOT NULL THEN
      -- Criar novo template
      INSERT INTO public.client_demand_templates (
        tenant_id,
        client_id,
        pipeline_id,
        status_id,
        title_template,
        demand_type,
        channel,
        default_publish_weekday,
        recurrence_hint,
        score,
        source
      ) VALUES (
        v_tenant_id,
        p_client_id,
        v_pipeline_id,
        v_status_id,
        v_pattern.demand_type || ' - ' || COALESCE(v_pattern.channel, 'Geral'),
        v_pattern.demand_type,
        v_pattern.channel,
        v_pattern.weekday,
        CASE 
          WHEN v_pattern.occurrences >= 8 THEN 'semanal'
          WHEN v_pattern.occurrences >= 4 THEN 'quinzenal'
          ELSE 'mensal'
        END,
        v_pattern.occurrences * 10,
        'learned'
      )
      RETURNING id INTO v_template_id;
      
      -- Criar stats
      INSERT INTO public.client_demand_template_stats (template_id, times_matched, last_matched_at)
      VALUES (v_template_id, v_pattern.occurrences, now());
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'message', 'Templates atualizados');
END;
$function$;