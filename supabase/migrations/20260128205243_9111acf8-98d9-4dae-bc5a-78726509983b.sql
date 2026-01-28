-- ========================================
-- SISTEMA ADAPTATIVO DE GERAÇÃO DE DEMANDAS
-- Parte 1: Tabelas de Feedback e Calendário
-- ========================================

-- 1. ENUM para tipos de eventos de feedback
CREATE TYPE public.demand_feedback_event_type AS ENUM (
  'deleted',           -- Demanda foi excluída pelo usuário
  'archived_without_publish', -- Arquivada sem nunca publicar
  'published',         -- Publicada com sucesso
  'rescheduled',       -- Reagendada
  'created',           -- Criada (baseline)
  'scheduled'          -- Agendada para publicação
);

-- 2. TABELA: Eventos de feedback de demandas (aprendizado implícito)
CREATE TABLE public.demand_feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  demand_id UUID REFERENCES public.demands(id) ON DELETE SET NULL,
  event_type demand_feedback_event_type NOT NULL,
  -- Dados da demanda para análise mesmo após exclusão
  demand_fingerprint TEXT, -- Hash: title + demand_type + channel
  demand_type TEXT,
  channel TEXT,
  title TEXT,
  publish_weekday INTEGER, -- 0-6 (domingo-sábado)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_feedback_events_client ON public.demand_feedback_events(client_id);
CREATE INDEX idx_feedback_events_fingerprint ON public.demand_feedback_events(demand_fingerprint);
CREATE INDEX idx_feedback_events_type ON public.demand_feedback_events(event_type);
CREATE INDEX idx_feedback_events_created ON public.demand_feedback_events(created_at DESC);

-- RLS
ALTER TABLE public.demand_feedback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_events_tenant_access" ON public.demand_feedback_events
  FOR ALL USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  );

-- 3. TABELA: Calendário brasileiro de datas comemorativas
CREATE TABLE public.br_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('holiday', 'seasonal', 'marketing', 'awareness')),
  priority INTEGER NOT NULL DEFAULT 50, -- 1-100, maior = mais importante
  description TEXT,
  marketing_tips TEXT, -- Dicas de como usar a data
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca por data
CREATE INDEX idx_calendar_date ON public.br_calendar_events(event_date);
CREATE INDEX idx_calendar_type ON public.br_calendar_events(event_type);

-- RLS - Leitura pública, escrita apenas super_admin
ALTER TABLE public.br_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_read_all" ON public.br_calendar_events
  FOR SELECT USING (true);

CREATE POLICY "calendar_manage_super_admin" ON public.br_calendar_events
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 4. TABELA: Scores de padrões por cliente (cache de cálculos)
CREATE TABLE public.demand_pattern_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL, -- 'demand_type', 'channel', 'weekday', 'fingerprint'
  pattern_value TEXT NOT NULL, -- valor do padrão (ex: 'Reels', 'Instagram', '2')
  success_score NUMERIC NOT NULL DEFAULT 0, -- score de sucesso
  failure_score NUMERIC NOT NULL DEFAULT 0, -- penalidade por falhas
  total_occurrences INTEGER NOT NULL DEFAULT 0,
  successful_occurrences INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, pattern_type, pattern_value)
);

-- Índices
CREATE INDEX idx_pattern_scores_client ON public.demand_pattern_scores(client_id);
CREATE INDEX idx_pattern_scores_type ON public.demand_pattern_scores(pattern_type);
CREATE INDEX idx_pattern_scores_score ON public.demand_pattern_scores(success_score DESC);

-- RLS
ALTER TABLE public.demand_pattern_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pattern_scores_tenant_access" ON public.demand_pattern_scores
  FOR ALL USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  );

-- 5. TABELA: Fingerprints de demandas já geradas (controle de repetição)
CREATE TABLE public.demand_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL, -- MD5 hash de title normalizado + demand_type + channel
  demand_id UUID REFERENCES public.demands(id) ON DELETE SET NULL,
  period_plan_id UUID REFERENCES public.period_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  demand_type TEXT,
  channel TEXT,
  was_successful BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_fingerprints_client ON public.demand_fingerprints(client_id);
CREATE INDEX idx_fingerprints_hash ON public.demand_fingerprints(fingerprint);
CREATE INDEX idx_fingerprints_created ON public.demand_fingerprints(created_at DESC);

-- RLS
ALTER TABLE public.demand_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fingerprints_tenant_access" ON public.demand_fingerprints
  FOR ALL USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  );

-- 6. POPULAR CALENDÁRIO BRASILEIRO (2025)
INSERT INTO public.br_calendar_events (event_date, name, event_type, priority, description, marketing_tips) VALUES
-- Feriados Nacionais 2025
('2025-01-01', 'Ano Novo', 'holiday', 90, 'Início do ano', 'Mensagens de boas festas, metas e novos começos'),
('2025-03-01', 'Carnaval (início)', 'holiday', 95, 'Carnaval brasileiro', 'Conteúdo festivo, promoções de carnaval'),
('2025-03-04', 'Carnaval (quarta de cinzas)', 'holiday', 80, 'Fim do Carnaval', 'Volta ao trabalho, detox'),
('2025-04-18', 'Sexta-feira Santa', 'holiday', 70, 'Feriado religioso', 'Respeitar a data, evitar vendas agressivas'),
('2025-04-20', 'Páscoa', 'holiday', 85, 'Domingo de Páscoa', 'Promoções de chocolates, família'),
('2025-04-21', 'Tiradentes', 'holiday', 60, 'Feriado nacional', 'Conteúdo sobre história, patriotismo'),
('2025-05-01', 'Dia do Trabalhador', 'holiday', 75, 'Feriado trabalhista', 'Valorização profissional, descanso'),
('2025-09-07', 'Independência do Brasil', 'holiday', 80, 'Feriado nacional', 'Patriotismo, verde e amarelo'),
('2025-10-12', 'Nossa Senhora Aparecida / Dia das Crianças', 'holiday', 95, 'Feriado duplo', 'Promoções infantis, conteúdo família'),
('2025-11-02', 'Finados', 'holiday', 50, 'Dia de finados', 'Evitar promoções, tom respeitoso'),
('2025-11-15', 'Proclamação da República', 'holiday', 60, 'Feriado nacional', 'Conteúdo institucional'),
('2025-12-25', 'Natal', 'holiday', 100, 'Natal', 'Promoções natalinas, família, presentes'),

-- Datas Comerciais/Marketing 2025
('2025-02-14', 'Dia de São Valentim (EUA)', 'marketing', 40, 'Valentine Day - referência internacional', 'Para público internacional ou jovem'),
('2025-03-08', 'Dia Internacional da Mulher', 'marketing', 90, 'Celebração das mulheres', 'Empoderamento feminino, homenagens'),
('2025-03-15', 'Dia do Consumidor', 'marketing', 95, 'Semana do Consumidor', 'Grandes promoções, descontos'),
('2025-05-11', 'Dia das Mães', 'marketing', 100, 'Segunda maior data comercial', 'Presentes, homenagens, promoções'),
('2025-06-12', 'Dia dos Namorados', 'marketing', 95, 'Dia dos namorados no Brasil', 'Casais, presentes românticos'),
('2025-06-29', 'Dia de São Pedro', 'seasonal', 40, 'Festas juninas finalizando', 'Último fôlego das campanhas juninas'),
('2025-07-20', 'Dia do Amigo', 'marketing', 70, 'Celebração da amizade', 'Promoções "leve 2", conteúdo sobre amizade'),
('2025-08-10', 'Dia dos Pais', 'marketing', 95, 'Terceira maior data comercial', 'Presentes masculinos, homenagens'),
('2025-09-21', 'Dia da Árvore', 'awareness', 50, 'Conscientização ambiental', 'Sustentabilidade, ESG'),
('2025-10-15', 'Dia do Professor', 'awareness', 60, 'Homenagem aos educadores', 'Reconhecimento, descontos para professores'),
('2025-10-31', 'Halloween', 'seasonal', 65, 'Dia das Bruxas', 'Fantasias, decoração, conteúdo temático'),
('2025-11-20', 'Dia da Consciência Negra', 'awareness', 75, 'Data de reflexão', 'Diversidade, inclusão, representatividade'),
('2025-11-28', 'Black Friday', 'marketing', 100, 'Maior evento de vendas', 'Descontos massivos, preparação antecipada'),
('2025-12-01', 'Cyber Monday', 'marketing', 85, 'Extensão digital da Black Friday', 'Promoções online'),
('2025-12-31', 'Réveillon', 'seasonal', 90, 'Virada de ano', 'Retrospectiva, metas, festas'),

-- Festas Juninas
('2025-06-01', 'Início das Festas Juninas', 'seasonal', 70, 'Começo do período junino', 'Decoração, comidas típicas'),
('2025-06-13', 'Dia de Santo Antônio', 'seasonal', 60, 'Festa junina', 'Santo casamenteiro, simpatias'),
('2025-06-24', 'São João', 'seasonal', 80, 'Principal festa junina', 'Fogueira, quadrilha, comidas típicas'),

-- Datas Sazonais
('2025-03-20', 'Início do Outono', 'seasonal', 40, 'Mudança de estação', 'Moda outono/inverno, transição'),
('2025-06-21', 'Início do Inverno', 'seasonal', 45, 'Estação mais fria', 'Roupas de frio, bebidas quentes, aconchego'),
('2025-09-22', 'Início da Primavera', 'seasonal', 50, 'Estação das flores', 'Renovação, cores vibrantes, alegria'),
('2025-12-21', 'Início do Verão', 'seasonal', 55, 'Estação mais quente', 'Praia, férias, corpo, saúde'),

-- Volta às Aulas
('2025-01-27', 'Volta às Aulas (início)', 'marketing', 80, 'Retorno escolar', 'Material escolar, uniformes, organização'),
('2025-07-21', 'Férias de Julho (início)', 'seasonal', 60, 'Férias escolares de meio de ano', 'Viagens, lazer, família');

-- 7. FUNÇÃO: Gerar fingerprint de demanda
CREATE OR REPLACE FUNCTION public.generate_demand_fingerprint(
  p_title TEXT,
  p_demand_type TEXT,
  p_channel TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN md5(
    lower(regexp_replace(COALESCE(p_title, ''), '[^a-zA-Z0-9]', '', 'g')) || 
    '|' || 
    lower(COALESCE(p_demand_type, '')) || 
    '|' || 
    lower(COALESCE(p_channel, ''))
  );
END;
$$;

-- 8. FUNÇÃO: Registrar evento de feedback
CREATE OR REPLACE FUNCTION public.record_demand_feedback(
  p_demand_id UUID,
  p_event_type demand_feedback_event_type
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demand RECORD;
  v_fingerprint TEXT;
  v_weekday INTEGER;
BEGIN
  -- Buscar dados da demanda
  SELECT 
    d.id, d.tenant_id, d.client_id, d.title, d.demand_type, d.channel, d.publish_date
  INTO v_demand
  FROM public.demands d
  WHERE d.id = p_demand_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Demanda não encontrada');
  END IF;
  
  -- Verificar permissão
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), v_demand.tenant_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  
  -- Gerar fingerprint
  v_fingerprint := generate_demand_fingerprint(v_demand.title, v_demand.demand_type, v_demand.channel);
  
  -- Calcular dia da semana
  v_weekday := CASE WHEN v_demand.publish_date IS NOT NULL 
    THEN EXTRACT(DOW FROM v_demand.publish_date)::INTEGER 
    ELSE NULL 
  END;
  
  -- Inserir evento
  INSERT INTO public.demand_feedback_events (
    tenant_id, client_id, demand_id, event_type,
    demand_fingerprint, demand_type, channel, title, publish_weekday
  ) VALUES (
    v_demand.tenant_id, v_demand.client_id, p_demand_id, p_event_type,
    v_fingerprint, v_demand.demand_type, v_demand.channel, v_demand.title, v_weekday
  );
  
  -- Atualizar scores de padrão
  PERFORM calculate_pattern_scores(v_demand.client_id);
  
  RETURN jsonb_build_object('success', true, 'fingerprint', v_fingerprint);
END;
$$;

-- 9. FUNÇÃO: Calcular scores de padrões
CREATE OR REPLACE FUNCTION public.calculate_pattern_scores(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_pattern RECORD;
BEGIN
  -- Buscar tenant
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies
  WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  -- CALCULAR SCORES POR DEMAND_TYPE
  INSERT INTO public.demand_pattern_scores (tenant_id, client_id, pattern_type, pattern_value, success_score, failure_score, total_occurrences, successful_occurrences, calculated_at, updated_at)
  SELECT 
    v_tenant_id,
    p_client_id,
    'demand_type',
    demand_type,
    -- Success score: publicações bem sucedidas
    COALESCE(SUM(CASE WHEN event_type = 'published' THEN 10 WHEN event_type = 'scheduled' THEN 5 ELSE 0 END), 0),
    -- Failure score: exclusões e não-uso penalizam
    COALESCE(SUM(CASE WHEN event_type = 'deleted' THEN 15 WHEN event_type = 'archived_without_publish' THEN 8 ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN event_type IN ('published', 'scheduled') THEN 1 ELSE 0 END), 0)::INTEGER,
    now(),
    now()
  FROM public.demand_feedback_events
  WHERE client_id = p_client_id
    AND demand_type IS NOT NULL
    AND created_at > now() - interval '180 days'
  GROUP BY demand_type
  ON CONFLICT (client_id, pattern_type, pattern_value) 
  DO UPDATE SET
    success_score = EXCLUDED.success_score,
    failure_score = EXCLUDED.failure_score,
    total_occurrences = EXCLUDED.total_occurrences,
    successful_occurrences = EXCLUDED.successful_occurrences,
    calculated_at = now(),
    updated_at = now();

  -- CALCULAR SCORES POR CHANNEL
  INSERT INTO public.demand_pattern_scores (tenant_id, client_id, pattern_type, pattern_value, success_score, failure_score, total_occurrences, successful_occurrences, calculated_at, updated_at)
  SELECT 
    v_tenant_id,
    p_client_id,
    'channel',
    channel,
    COALESCE(SUM(CASE WHEN event_type = 'published' THEN 10 WHEN event_type = 'scheduled' THEN 5 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN event_type = 'deleted' THEN 15 WHEN event_type = 'archived_without_publish' THEN 8 ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN event_type IN ('published', 'scheduled') THEN 1 ELSE 0 END), 0)::INTEGER,
    now(),
    now()
  FROM public.demand_feedback_events
  WHERE client_id = p_client_id
    AND channel IS NOT NULL
    AND created_at > now() - interval '180 days'
  GROUP BY channel
  ON CONFLICT (client_id, pattern_type, pattern_value) 
  DO UPDATE SET
    success_score = EXCLUDED.success_score,
    failure_score = EXCLUDED.failure_score,
    total_occurrences = EXCLUDED.total_occurrences,
    successful_occurrences = EXCLUDED.successful_occurrences,
    calculated_at = now(),
    updated_at = now();

  -- CALCULAR SCORES POR DIA DA SEMANA
  INSERT INTO public.demand_pattern_scores (tenant_id, client_id, pattern_type, pattern_value, success_score, failure_score, total_occurrences, successful_occurrences, calculated_at, updated_at)
  SELECT 
    v_tenant_id,
    p_client_id,
    'weekday',
    publish_weekday::TEXT,
    COALESCE(SUM(CASE WHEN event_type = 'published' THEN 10 WHEN event_type = 'scheduled' THEN 5 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN event_type = 'deleted' THEN 15 WHEN event_type = 'archived_without_publish' THEN 8 ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN event_type IN ('published', 'scheduled') THEN 1 ELSE 0 END), 0)::INTEGER,
    now(),
    now()
  FROM public.demand_feedback_events
  WHERE client_id = p_client_id
    AND publish_weekday IS NOT NULL
    AND created_at > now() - interval '180 days'
  GROUP BY publish_weekday
  ON CONFLICT (client_id, pattern_type, pattern_value) 
  DO UPDATE SET
    success_score = EXCLUDED.success_score,
    failure_score = EXCLUDED.failure_score,
    total_occurrences = EXCLUDED.total_occurrences,
    successful_occurrences = EXCLUDED.successful_occurrences,
    calculated_at = now(),
    updated_at = now();

  -- CALCULAR SCORES POR FINGERPRINT (ideias específicas)
  INSERT INTO public.demand_pattern_scores (tenant_id, client_id, pattern_type, pattern_value, success_score, failure_score, total_occurrences, successful_occurrences, calculated_at, updated_at)
  SELECT 
    v_tenant_id,
    p_client_id,
    'fingerprint',
    demand_fingerprint,
    COALESCE(SUM(CASE WHEN event_type = 'published' THEN 10 WHEN event_type = 'scheduled' THEN 5 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN event_type = 'deleted' THEN 20 WHEN event_type = 'archived_without_publish' THEN 10 ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN event_type IN ('published', 'scheduled') THEN 1 ELSE 0 END), 0)::INTEGER,
    now(),
    now()
  FROM public.demand_feedback_events
  WHERE client_id = p_client_id
    AND demand_fingerprint IS NOT NULL
    AND created_at > now() - interval '365 days'
  GROUP BY demand_fingerprint
  ON CONFLICT (client_id, pattern_type, pattern_value) 
  DO UPDATE SET
    success_score = EXCLUDED.success_score,
    failure_score = EXCLUDED.failure_score,
    total_occurrences = EXCLUDED.total_occurrences,
    successful_occurrences = EXCLUDED.successful_occurrences,
    calculated_at = now(),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Scores recalculados');
END;
$$;

-- 10. FUNÇÃO: Obter contexto adaptativo para geração de planejamento
CREATE OR REPLACE FUNCTION public.get_contextual_planning_input(
  p_client_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_result JSONB;
  v_calendar_events JSONB;
  v_successful_patterns JSONB;
  v_failed_patterns JSONB;
  v_recent_fingerprints JSONB;
  v_top_demand_types JSONB;
  v_avoid_fingerprints JSONB;
BEGIN
  -- Buscar tenant
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_companies
  WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  -- 1. DATAS COMEMORATIVAS NO PERÍODO
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', event_date,
      'name', name,
      'type', event_type,
      'priority', priority,
      'tips', marketing_tips
    ) ORDER BY event_date
  ), '[]'::jsonb)
  INTO v_calendar_events
  FROM public.br_calendar_events
  WHERE event_date BETWEEN p_period_start AND p_period_end;

  -- 2. PADRÕES DE SUCESSO (para reforçar)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type', pattern_type,
      'value', pattern_value,
      'success_rate', CASE WHEN total_occurrences > 0 
        THEN ROUND((successful_occurrences::NUMERIC / total_occurrences) * 100, 1)
        ELSE 0 
      END,
      'net_score', success_score - failure_score
    ) ORDER BY (success_score - failure_score) DESC
  ), '[]'::jsonb)
  INTO v_successful_patterns
  FROM public.demand_pattern_scores
  WHERE client_id = p_client_id
    AND success_score > failure_score
    AND total_occurrences >= 2
  LIMIT 15;

  -- 3. PADRÕES PROBLEMÁTICOS (para evitar)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type', pattern_type,
      'value', pattern_value,
      'failure_rate', CASE WHEN total_occurrences > 0 
        THEN ROUND(((total_occurrences - successful_occurrences)::NUMERIC / total_occurrences) * 100, 1)
        ELSE 0 
      END
    ) ORDER BY failure_score DESC
  ), '[]'::jsonb)
  INTO v_failed_patterns
  FROM public.demand_pattern_scores
  WHERE client_id = p_client_id
    AND failure_score > success_score
    AND total_occurrences >= 2
  LIMIT 10;

  -- 4. FINGERPRINTS RECENTES (últimos 6 meses) - para evitar repetição
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fingerprint', fingerprint,
      'title', title,
      'was_successful', was_successful
    )
  ), '[]'::jsonb)
  INTO v_recent_fingerprints
  FROM public.demand_fingerprints
  WHERE client_id = p_client_id
    AND created_at > now() - interval '180 days'
  LIMIT 50;

  -- 5. TOP DEMAND TYPES que funcionam
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'demand_type', pattern_value,
      'success_count', successful_occurrences
    ) ORDER BY successful_occurrences DESC
  ), '[]'::jsonb)
  INTO v_top_demand_types
  FROM public.demand_pattern_scores
  WHERE client_id = p_client_id
    AND pattern_type = 'demand_type'
    AND successful_occurrences > 0
  LIMIT 5;

  -- 6. FINGERPRINTS A EVITAR (excluídos ou nunca usados)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fingerprint', pattern_value,
      'reason', CASE 
        WHEN failure_score >= 20 THEN 'deleted_multiple_times'
        WHEN failure_score >= 10 THEN 'never_used'
        ELSE 'low_engagement'
      END
    )
  ), '[]'::jsonb)
  INTO v_avoid_fingerprints
  FROM public.demand_pattern_scores
  WHERE client_id = p_client_id
    AND pattern_type = 'fingerprint'
    AND failure_score > success_score
    AND failure_score >= 10
  LIMIT 20;

  -- MONTAR RESULTADO
  v_result := jsonb_build_object(
    'success', true,
    'calendar_events', v_calendar_events,
    'successful_patterns', v_successful_patterns,
    'failed_patterns', v_failed_patterns,
    'recent_fingerprints', v_recent_fingerprints,
    'top_demand_types', v_top_demand_types,
    'avoid_fingerprints', v_avoid_fingerprints,
    'period', jsonb_build_object(
      'start', p_period_start,
      'end', p_period_end
    )
  );

  RETURN v_result;
END;
$$;

-- 11. TRIGGER: Registrar automaticamente eventos de feedback quando demanda é excluída
CREATE OR REPLACE FUNCTION public.trigger_demand_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fingerprint TEXT;
  v_weekday INTEGER;
BEGIN
  -- Gerar fingerprint
  v_fingerprint := generate_demand_fingerprint(OLD.title, OLD.demand_type, OLD.channel);
  
  -- Calcular dia da semana
  v_weekday := CASE WHEN OLD.publish_date IS NOT NULL 
    THEN EXTRACT(DOW FROM OLD.publish_date)::INTEGER 
    ELSE NULL 
  END;

  -- Registrar evento de exclusão
  INSERT INTO public.demand_feedback_events (
    tenant_id, client_id, demand_id, event_type,
    demand_fingerprint, demand_type, channel, title, publish_weekday
  ) VALUES (
    OLD.tenant_id, OLD.client_id, OLD.id, 'deleted',
    v_fingerprint, OLD.demand_type, OLD.channel, OLD.title, v_weekday
  );

  RETURN OLD;
END;
$$;

CREATE TRIGGER on_demand_deleted
  BEFORE DELETE ON public.demands
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_demand_deleted();

-- 12. TRIGGER: Registrar quando demanda é publicada (status final atingido)
CREATE OR REPLACE FUNCTION public.trigger_demand_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_final BOOLEAN;
  v_fingerprint TEXT;
  v_weekday INTEGER;
BEGIN
  -- Verificar se o novo status é final
  SELECT is_final INTO v_is_final
  FROM public.pipeline_statuses
  WHERE id = NEW.status_id;

  -- Se mudou para status final, registrar como publicado
  IF v_is_final = true AND (OLD.status_id IS NULL OR OLD.status_id != NEW.status_id) THEN
    v_fingerprint := generate_demand_fingerprint(NEW.title, NEW.demand_type, NEW.channel);
    v_weekday := CASE WHEN NEW.publish_date IS NOT NULL 
      THEN EXTRACT(DOW FROM NEW.publish_date)::INTEGER 
      ELSE NULL 
    END;

    INSERT INTO public.demand_feedback_events (
      tenant_id, client_id, demand_id, event_type,
      demand_fingerprint, demand_type, channel, title, publish_weekday
    ) VALUES (
      NEW.tenant_id, NEW.client_id, NEW.id, 'published',
      v_fingerprint, NEW.demand_type, NEW.channel, NEW.title, v_weekday
    );

    -- Atualizar fingerprint como bem-sucedido
    UPDATE public.demand_fingerprints
    SET was_successful = true
    WHERE demand_id = NEW.id;
  END IF;

  -- Se agendou (publish_date definido), registrar
  IF NEW.publish_date IS NOT NULL AND (OLD.publish_date IS NULL OR OLD.publish_date != NEW.publish_date) THEN
    v_fingerprint := generate_demand_fingerprint(NEW.title, NEW.demand_type, NEW.channel);
    v_weekday := EXTRACT(DOW FROM NEW.publish_date)::INTEGER;

    INSERT INTO public.demand_feedback_events (
      tenant_id, client_id, demand_id, event_type,
      demand_fingerprint, demand_type, channel, title, publish_weekday
    ) VALUES (
      NEW.tenant_id, NEW.client_id, NEW.id, 'scheduled',
      v_fingerprint, NEW.demand_type, NEW.channel, NEW.title, v_weekday
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_demand_status_change
  AFTER UPDATE ON public.demands
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_demand_status_change();