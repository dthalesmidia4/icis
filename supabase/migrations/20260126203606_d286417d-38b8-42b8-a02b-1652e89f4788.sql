-- Inicializar pipeline padrão para o tenant existente
DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000001';
  v_pipeline_id uuid;
  v_initial_status_id uuid;
BEGIN
  -- Verificar se já existe pipeline
  IF NOT EXISTS (SELECT 1 FROM public.pipelines WHERE tenant_id = v_tenant_id) THEN
    -- Criar pipeline padrão
    INSERT INTO public.pipelines (tenant_id, name, description, is_default, position)
    VALUES (v_tenant_id, 'Produção de Conteúdo', 'Pipeline padrão para produção de conteúdo', true, 0)
    RETURNING id INTO v_pipeline_id;
    
    -- Criar status padrão
    INSERT INTO public.pipeline_statuses (pipeline_id, name, color, position, is_initial, is_final, requires_fields) VALUES
      (v_pipeline_id, 'Planejamento', '#8b5cf6', 0, true, false, '[]'),
      (v_pipeline_id, 'Produção', '#f59e0b', 1, false, false, '[]'),
      (v_pipeline_id, 'Revisão', '#10b981', 2, false, false, '[]'),
      (v_pipeline_id, 'Aguardando Cliente', '#eab308', 3, false, false, '[]'),
      (v_pipeline_id, 'Agendar Publicação', '#06b6d4', 4, false, false, '["publish_date"]'),
      (v_pipeline_id, 'Publicado', '#22c55e', 5, false, true, '["publish_date"]');
    
    -- Buscar status inicial
    SELECT id INTO v_initial_status_id
    FROM public.pipeline_statuses
    WHERE pipeline_id = v_pipeline_id AND is_initial = true
    LIMIT 1;
    
    -- Criar templates seed para cada cliente existente
    INSERT INTO public.client_demand_templates (tenant_id, client_id, pipeline_id, status_id, title_template, demand_type, channel, recurrence_hint, score, source)
    SELECT 
      v_tenant_id,
      tc.id,
      v_pipeline_id,
      v_initial_status_id,
      seed.title,
      seed.demand_type,
      seed.channel,
      seed.recurrence,
      seed.score,
      'seed'
    FROM public.tenant_companies tc
    CROSS JOIN (VALUES
      ('Captação Semanal', 'Captação', 'Instagram', 'semanal', 80),
      ('Reels da Semana', 'Reel', 'Instagram', 'semanal', 75),
      ('Post Institucional', 'Post', 'Instagram', 'mensal', 60),
      ('Carrossel Educativo', 'Carrossel', 'Instagram', 'quinzenal', 70),
      ('Stories do Dia', 'Stories', 'Instagram', 'semanal', 85),
      ('Post LinkedIn', 'Post', 'LinkedIn', 'semanal', 65)
    ) AS seed(title, demand_type, channel, recurrence, score)
    WHERE tc.tenant_id = v_tenant_id;
    
    RAISE NOTICE 'Pipeline e templates criados com sucesso!';
  ELSE
    RAISE NOTICE 'Pipeline já existe para este tenant';
  END IF;
END $$;