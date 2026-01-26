-- =====================================================
-- MIGRATION: Sistema de Demandas com Templates Inteligentes
-- =====================================================

-- 1. CRIAR TABELA DE PIPELINES (dinâmicos por agência)
CREATE TABLE IF NOT EXISTS public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- 2. CRIAR TABELA DE STATUS DO PIPELINE
CREATE TABLE IF NOT EXISTS public.pipeline_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  position int NOT NULL DEFAULT 0,
  requires_fields jsonb NOT NULL DEFAULT '[]'::jsonb, -- ex: ["publish_date", "description"]
  is_initial boolean NOT NULL DEFAULT false,
  is_final boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pipeline_id, name)
);

-- 3. CRIAR TABELA UNIVERSAL DE DEMANDAS
CREATE TABLE IF NOT EXISTS public.demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE RESTRICT,
  status_id uuid NOT NULL REFERENCES public.pipeline_statuses(id) ON DELETE RESTRICT,
  period_plan_id uuid REFERENCES public.period_plans(id) ON DELETE SET NULL,
  
  -- Conteúdo da demanda
  title text NOT NULL,
  description text,
  instructions text,
  objective text,
  
  -- Metadados
  demand_type text, -- Captação, Reel, Carrossel, etc.
  channel text, -- Instagram, LinkedIn, etc.
  
  -- Datas
  publish_date date,
  due_date date,
  
  -- Arquivos e anexos
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Origem
  source text NOT NULL DEFAULT 'manual', -- 'manual', 'ai_generated', 'template'
  template_id uuid, -- referência ao template usado (se houver)
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 4. CRIAR TABELA DE TEMPLATES DE DEMANDA POR CLIENTE
CREATE TABLE IF NOT EXISTS public.client_demand_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  status_id uuid NOT NULL REFERENCES public.pipeline_statuses(id) ON DELETE CASCADE,
  
  -- Template content
  title_template text NOT NULL,
  instructions_template text,
  demand_type text,
  channel text,
  
  -- Padrões aprendidos
  default_publish_weekday int CHECK (default_publish_weekday >= 0 AND default_publish_weekday <= 6),
  default_due_offset_days int,
  recurrence_hint text, -- 'semanal', 'quinzenal', 'mensal'
  
  -- Ranking
  score numeric(6,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'learned' CHECK (source IN ('seed', 'learned', 'manual')),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. CRIAR TABELA DE ESTATÍSTICAS DE TEMPLATES
CREATE TABLE IF NOT EXISTS public.client_demand_template_stats (
  template_id uuid PRIMARY KEY REFERENCES public.client_demand_templates(id) ON DELETE CASCADE,
  times_used int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  times_matched int NOT NULL DEFAULT 0,
  last_matched_at timestamptz
);

-- 6. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_pipelines_tenant ON public.pipelines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_statuses_pipeline ON public.pipeline_statuses(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_demands_tenant ON public.demands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_demands_client ON public.demands(client_id);
CREATE INDEX IF NOT EXISTS idx_demands_pipeline ON public.demands(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_demands_status ON public.demands(status_id);
CREATE INDEX IF NOT EXISTS idx_demands_period ON public.demands(period_plan_id);
CREATE INDEX IF NOT EXISTS idx_demands_created ON public.demands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_templates_client ON public.client_demand_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_client_templates_tenant ON public.client_demand_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_templates_score ON public.client_demand_templates(score DESC);

-- 7. HABILITAR RLS
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_demand_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_demand_template_stats ENABLE ROW LEVEL SECURITY;

-- 8. POLÍTICAS RLS PARA PIPELINES
CREATE POLICY "pipelines_tenant_access" ON public.pipelines
  FOR ALL USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.user_has_tenant_access(auth.uid(), tenant_id)
  );

-- 9. POLÍTICAS RLS PARA PIPELINE_STATUSES (via pipeline -> tenant)
CREATE POLICY "pipeline_statuses_access" ON public.pipeline_statuses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_id
      AND (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR
        public.user_has_tenant_access(auth.uid(), p.tenant_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_id
      AND (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR
        public.user_has_tenant_access(auth.uid(), p.tenant_id)
      )
    )
  );

-- 10. POLÍTICAS RLS PARA DEMANDS
CREATE POLICY "demands_tenant_access" ON public.demands
  FOR ALL USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.user_has_tenant_access(auth.uid(), tenant_id)
  );

-- 11. POLÍTICAS RLS PARA CLIENT_DEMAND_TEMPLATES
-- SELECT: todos da agency podem ler
CREATE POLICY "templates_select" ON public.client_demand_templates
  FOR SELECT USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.user_has_tenant_access(auth.uid(), tenant_id)
  );

-- INSERT/UPDATE/DELETE: apenas admin e super_admin
CREATE POLICY "templates_manage" ON public.client_demand_templates
  FOR ALL USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.is_agency_admin(tenant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.is_agency_admin(tenant_id)
  );

-- 12. POLÍTICAS RLS PARA STATS (via template -> tenant)
CREATE POLICY "template_stats_access" ON public.client_demand_template_stats
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.client_demand_templates t
      WHERE t.id = template_id
      AND (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR
        public.user_has_tenant_access(auth.uid(), t.tenant_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_demand_templates t
      WHERE t.id = template_id
      AND (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR
        public.user_has_tenant_access(auth.uid(), t.tenant_id)
      )
    )
  );

-- 13. TRIGGERS PARA UPDATED_AT
CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipeline_statuses_updated_at
  BEFORE UPDATE ON public.pipeline_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_demands_updated_at
  BEFORE UPDATE ON public.demands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_templates_updated_at
  BEFORE UPDATE ON public.client_demand_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 14. FUNÇÃO HELPER: Verificar se usuário pode criar demandas
CREATE OR REPLACE FUNCTION public.can_create_demands(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Super admin pode sempre
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR
    -- Agency manager pode na sua tenant
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND role = 'agency_manager'
    )
$$;

-- 15. RPC: Buscar sugestões de demanda para um cliente
CREATE OR REPLACE FUNCTION public.get_client_demand_suggestions(
  p_client_id uuid,
  p_limit int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_strategy_snippet text;
  v_result jsonb;
BEGIN
  -- Buscar tenant do cliente
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies
  WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;
  
  -- Verificar acesso
  IF NOT (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), v_tenant_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  
  -- Buscar snippet da estratégia ativa (se houver)
  SELECT LEFT(strategy_text, 200) INTO v_strategy_snippet
  FROM public.strategies
  WHERE company_id = p_client_id
  AND status = 'Ativa'
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Buscar templates ordenados por score
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
            'times_used', COALESCE(s.times_used, 0),
            'suggested_publish_date', CASE 
              WHEN t.default_publish_weekday IS NOT NULL THEN
                -- Calcular próxima data com base no dia da semana
                CURRENT_DATE + ((t.default_publish_weekday - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7)
              ELSE NULL
            END
          )
          ORDER BY t.score DESC
        )
        FROM public.client_demand_templates t
        LEFT JOIN public.client_demand_template_stats s ON s.template_id = t.id
        WHERE t.client_id = p_client_id
        LIMIT p_limit
      ),
      '[]'::jsonb
    )
  ) INTO v_result;
  
  -- Se não há templates específicos, buscar seeds genéricos
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
            )
            ORDER BY t.score DESC
          )
          FROM public.client_demand_templates t
          WHERE t.tenant_id = v_tenant_id
          AND t.source = 'seed'
          LIMIT p_limit
        ),
        '[]'::jsonb
      )
    ) INTO v_result;
  END IF;
  
  RETURN v_result;
END;
$$;

-- 16. RPC: Criar demanda (com ou sem template)
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
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_demand_id uuid;
  v_pipeline_id uuid;
  v_status_id uuid;
  v_required_fields jsonb;
BEGIN
  -- Buscar tenant do cliente
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies
  WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;
  
  -- Verificar permissão (SUPER_ADMIN ou AGENCY_MANAGER)
  IF NOT public.can_create_demands(v_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para criar demandas');
  END IF;
  
  -- Definir pipeline e status
  v_pipeline_id := p_pipeline_id;
  v_status_id := p_status_id;
  
  -- Se não informado, buscar pipeline padrão
  IF v_pipeline_id IS NULL THEN
    SELECT id INTO v_pipeline_id
    FROM public.pipelines
    WHERE tenant_id = v_tenant_id AND is_default = true
    LIMIT 1;
    
    -- Se não há padrão, pegar o primeiro
    IF v_pipeline_id IS NULL THEN
      SELECT id INTO v_pipeline_id
      FROM public.pipelines
      WHERE tenant_id = v_tenant_id
      ORDER BY position
      LIMIT 1;
    END IF;
  END IF;
  
  IF v_pipeline_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum pipeline encontrado. Crie um pipeline primeiro.');
  END IF;
  
  -- Se status não informado, buscar status inicial
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id
    FROM public.pipeline_statuses
    WHERE pipeline_id = v_pipeline_id AND is_initial = true
    LIMIT 1;
    
    -- Se não há inicial, pegar o primeiro
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id
      FROM public.pipeline_statuses
      WHERE pipeline_id = v_pipeline_id
      ORDER BY position
      LIMIT 1;
    END IF;
  END IF;
  
  IF v_status_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum status encontrado para o pipeline.');
  END IF;
  
  -- Validar requires_fields do status
  SELECT requires_fields INTO v_required_fields
  FROM public.pipeline_statuses
  WHERE id = v_status_id;
  
  -- Verificar campos obrigatórios
  IF v_required_fields IS NOT NULL AND jsonb_array_length(v_required_fields) > 0 THEN
    IF 'publish_date' = ANY(SELECT jsonb_array_elements_text(v_required_fields)) AND p_publish_date IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Data de publicação obrigatória para este status');
    END IF;
    IF 'description' = ANY(SELECT jsonb_array_elements_text(v_required_fields)) AND (p_description IS NULL OR p_description = '') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Descrição obrigatória para este status');
    END IF;
  END IF;
  
  -- Criar demanda
  INSERT INTO public.demands (
    tenant_id,
    client_id,
    pipeline_id,
    status_id,
    period_plan_id,
    title,
    description,
    demand_type,
    channel,
    publish_date,
    due_date,
    template_id,
    source,
    created_by
  ) VALUES (
    v_tenant_id,
    p_client_id,
    v_pipeline_id,
    v_status_id,
    p_period_plan_id,
    COALESCE(p_title, 'Nova Demanda'),
    p_description,
    p_demand_type,
    p_channel,
    p_publish_date,
    p_due_date,
    p_template_id,
    CASE WHEN p_template_id IS NOT NULL THEN 'template' ELSE 'manual' END,
    auth.uid()
  )
  RETURNING id INTO v_demand_id;
  
  -- Se usou template, atualizar estatísticas
  IF p_template_id IS NOT NULL THEN
    INSERT INTO public.client_demand_template_stats (template_id, times_used, last_used_at)
    VALUES (p_template_id, 1, now())
    ON CONFLICT (template_id) DO UPDATE
    SET times_used = client_demand_template_stats.times_used + 1,
        last_used_at = now();
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'demand_id', v_demand_id
  );
END;
$$;

-- 17. RPC: Atualizar templates (refresh heurístico)
CREATE OR REPLACE FUNCTION public.refresh_client_templates(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- Verificar permissão
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
$$;

-- 18. RPC: Inicializar pipeline padrão para tenant (usado no setup)
CREATE OR REPLACE FUNCTION public.initialize_default_pipeline(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id uuid;
BEGIN
  -- Verificar se já existe pipeline
  IF EXISTS (SELECT 1 FROM public.pipelines WHERE tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Pipeline já existe');
  END IF;
  
  -- Criar pipeline padrão
  INSERT INTO public.pipelines (tenant_id, name, description, is_default, position)
  VALUES (p_tenant_id, 'Produção de Conteúdo', 'Pipeline padrão para produção de conteúdo', true, 0)
  RETURNING id INTO v_pipeline_id;
  
  -- Criar status padrão
  INSERT INTO public.pipeline_statuses (pipeline_id, name, color, position, is_initial, requires_fields) VALUES
    (v_pipeline_id, 'Planejamento', '#8b5cf6', 0, true, '[]'),
    (v_pipeline_id, 'Produção', '#f59e0b', 1, false, '[]'),
    (v_pipeline_id, 'Revisão', '#10b981', 2, false, '[]'),
    (v_pipeline_id, 'Aguardando Cliente', '#eab308', 3, false, '[]'),
    (v_pipeline_id, 'Agendar Publicação', '#06b6d4', 4, false, '["publish_date"]'),
    (v_pipeline_id, 'Publicado', '#22c55e', 5, true, '["publish_date"]');
  
  -- Criar templates seed
  INSERT INTO public.client_demand_templates (tenant_id, client_id, pipeline_id, status_id, title_template, demand_type, channel, recurrence_hint, score, source)
  SELECT 
    p_tenant_id,
    tc.id,
    v_pipeline_id,
    (SELECT id FROM public.pipeline_statuses WHERE pipeline_id = v_pipeline_id AND is_initial = true LIMIT 1),
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
  WHERE tc.tenant_id = p_tenant_id;
  
  RETURN jsonb_build_object('success', true, 'pipeline_id', v_pipeline_id);
END;
$$;