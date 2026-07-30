-- 1. Área nas etapas de fluxo
ALTER TABLE public.flow_functions
  ADD COLUMN IF NOT EXISTS work_area work_area NOT NULL DEFAULT 'midia',
  ADD COLUMN IF NOT EXISTS requires_client_origin boolean NOT NULL DEFAULT false;

ALTER TABLE public.flow_functions
  DROP CONSTRAINT IF EXISTS flow_functions_tenant_id_function_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS flow_functions_tenant_area_key_uidx
  ON public.flow_functions (tenant_id, work_area, function_key);

ALTER TABLE public.demand_type_flow_rules
  ADD COLUMN IF NOT EXISTS work_area work_area NOT NULL DEFAULT 'midia';

-- 2. Origem da demanda
ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS origin_note text;

ALTER TABLE public.demands DROP CONSTRAINT IF EXISTS demands_origin_check;
ALTER TABLE public.demands ADD CONSTRAINT demands_origin_check
  CHECK (origin IN ('interno','cliente_solicitacao','cliente_feedback','suporte'));

-- 3. Novos tipos de demanda (Sistemas)
ALTER TABLE public.demands DROP CONSTRAINT IF EXISTS demands_demand_type_key_check;
ALTER TABLE public.demands ADD CONSTRAINT demands_demand_type_key_check
  CHECK (
    demand_type_key IS NULL OR demand_type_key = ANY (ARRAY[
      'criativo_estatico','carrossel','video_captado','video_gerado','anuncio','outro',
      'bug_n1','bug_n2','bug_n3','desenvolvimento','melhoria','suporte'
    ])
  );

-- 4. Cadastro leve de cliente
ALTER TABLE public.tenant_companies
  ALTER COLUMN cnpj_cpf DROP NOT NULL,
  ALTER COLUMN sector DROP NOT NULL,
  ALTER COLUMN size DROP NOT NULL,
  ALTER COLUMN products_services DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.tenant_companies
  ALTER COLUMN cnpj_cpf SET DEFAULT '',
  ALTER COLUMN sector SET DEFAULT '',
  ALTER COLUMN size SET DEFAULT '',
  ALTER COLUMN products_services SET DEFAULT '',
  ALTER COLUMN email SET DEFAULT '',
  ALTER COLUMN phone SET DEFAULT '';

ALTER TABLE public.tenant_companies
  ADD COLUMN IF NOT EXISTS contact_cadence_days integer NOT NULL DEFAULT 30;

-- 5. Etapas de Sistemas para cada tenant que já tem fluxo configurado
INSERT INTO public.flow_functions (tenant_id, function_key, name, position, active, work_area, requires_client_origin, config)
SELECT t.tenant_id, s.function_key, s.name, s.position, true, 'sistemas'::work_area, s.requires_client_origin, '{}'::jsonb
FROM (SELECT DISTINCT tenant_id FROM public.flow_functions) t
CROSS JOIN (VALUES
  ('especificar',       'Especificar',                    0, false),
  ('desenvolver',       'Em desenvolvimento',             1, false),
  ('corrigir_bug_n1',   'Correção de bug — Nível 1',      2, false),
  ('corrigir_bug_n2',   'Correção de bug — Nível 2',      3, false),
  ('corrigir_bug_n3',   'Correção de bug — Nível 3',      4, false),
  ('testar',            'Testar',                         5, false),
  ('ajustar',           'Ajustar',                        6, false),
  ('revisar',           'Revisar',                        7, false),
  ('entregar_cliente',  'Entregar ao cliente',            8, true),
  ('aguardando_cliente','Aguardando cliente',             9, true),
  ('feedback_cliente',  'Feedback ao cliente',           10, true)
) AS s(function_key, name, position, requires_client_origin)
ON CONFLICT DO NOTHING;

-- 6. Regras por tipo de demanda (Sistemas)
INSERT INTO public.demand_type_flow_rules (tenant_id, demand_type_key, demand_type_name, function_key, requirement, work_area)
SELECT t.tenant_id, r.type_key, r.type_name, r.function_key, r.requirement, 'sistemas'::work_area
FROM (SELECT DISTINCT tenant_id FROM public.flow_functions) t
CROSS JOIN (
  SELECT ty.type_key, ty.type_name, fn.function_key,
    CASE
      WHEN fn.function_key IN ('entregar_cliente','aguardando_cliente','feedback_cliente') THEN 'required'
      WHEN fn.function_key = 'especificar' THEN 'required'
      WHEN fn.function_key = 'testar' THEN 'required'
      WHEN fn.function_key = 'ajustar' THEN 'disabled'
      WHEN fn.function_key = 'revisar' THEN CASE WHEN ty.type_key IN ('desenvolvimento','melhoria') THEN 'required' ELSE 'disabled' END
      WHEN fn.function_key = 'desenvolver' THEN CASE WHEN ty.type_key IN ('desenvolvimento','melhoria','suporte') THEN 'required' ELSE 'disabled' END
      WHEN fn.function_key = 'corrigir_bug_n1' THEN CASE WHEN ty.type_key = 'bug_n1' THEN 'required' ELSE 'disabled' END
      WHEN fn.function_key = 'corrigir_bug_n2' THEN CASE WHEN ty.type_key = 'bug_n2' THEN 'required' ELSE 'disabled' END
      WHEN fn.function_key = 'corrigir_bug_n3' THEN CASE WHEN ty.type_key = 'bug_n3' THEN 'required' ELSE 'disabled' END
      ELSE 'disabled'
    END AS requirement
  FROM (VALUES
    ('bug_n1','Bug nível 1'),
    ('bug_n2','Bug nível 2'),
    ('bug_n3','Bug nível 3'),
    ('desenvolvimento','Desenvolvimento'),
    ('melhoria','Melhoria'),
    ('suporte','Suporte')
  ) AS ty(type_key, type_name)
  CROSS JOIN (VALUES
    ('especificar'),('desenvolver'),('corrigir_bug_n1'),('corrigir_bug_n2'),('corrigir_bug_n3'),
    ('testar'),('ajustar'),('revisar'),('entregar_cliente'),('aguardando_cliente'),('feedback_cliente')
  ) AS fn(function_key)
) r
ON CONFLICT (tenant_id, demand_type_key, function_key) DO NOTHING;

-- 7. Pontos de contato com o cliente
CREATE TABLE IF NOT EXISTS public.client_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  demand_id uuid REFERENCES public.demands(id) ON DELETE SET NULL,
  touchpoint_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  summary text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_touchpoints_type_check CHECK (
    touchpoint_type IN ('visita','reuniao','ligacao','mensagem','treinamento','entrega','feedback','outro')
  ),
  CONSTRAINT client_touchpoints_source_check CHECK (source IN ('manual','auto'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_touchpoints TO authenticated;
GRANT ALL ON public.client_touchpoints TO service_role;

ALTER TABLE public.client_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view touchpoints"
  ON public.client_touchpoints FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can create touchpoints"
  ON public.client_touchpoints FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update touchpoints"
  ON public.client_touchpoints FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Authors and admins can delete touchpoints"
  ON public.client_touchpoints FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.is_agency_admin(tenant_id)
  );

CREATE INDEX IF NOT EXISTS client_touchpoints_client_idx
  ON public.client_touchpoints (tenant_id, client_id, occurred_at DESC);

CREATE TRIGGER client_touchpoints_updated_at
  BEFORE UPDATE ON public.client_touchpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Backfill: envios/feedbacks já registrados no histórico viram pontos de contato
INSERT INTO public.client_touchpoints (tenant_id, client_id, demand_id, touchpoint_type, source, occurred_at, summary, created_by)
SELECT h.tenant_id, d.client_id, d.id,
  CASE WHEN h.to_function_key = 'feedback_cliente' THEN 'feedback' ELSE 'entrega' END,
  'auto', h.created_at,
  'Registro automático: ' || d.title,
  h.created_by
FROM public.demand_flow_history h
JOIN public.demands d ON d.id = h.demand_id
WHERE h.to_function_key IN ('aguardando_cliente','entregar_cliente','feedback_cliente')
  AND h.action IN ('proceeded','sent_to_client');
