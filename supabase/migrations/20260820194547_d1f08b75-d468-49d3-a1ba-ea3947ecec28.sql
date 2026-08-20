ALTER TABLE public.systems_clients
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS commercial_stage text NULL,
  ADD COLUMN IF NOT EXISTS segment text NULL,
  ADD COLUMN IF NOT EXISTS current_system text NULL,
  ADD COLUMN IF NOT EXISTS address text NULL,
  ADD COLUMN IF NOT EXISTS commercial_owner_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_action text NULL,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_contact_result text NULL,
  ADD COLUMN IF NOT EXISTS loss_reason text NULL,
  ADD COLUMN IF NOT EXISTS lead_source text NULL;

ALTER TABLE public.systems_clients DROP CONSTRAINT IF EXISTS systems_clients_lifecycle_check;
ALTER TABLE public.systems_clients ADD CONSTRAINT systems_clients_lifecycle_check
  CHECK (lifecycle IN ('prospect','customer'));

ALTER TABLE public.systems_clients DROP CONSTRAINT IF EXISTS systems_clients_commercial_stage_check;
ALTER TABLE public.systems_clients ADD CONSTRAINT systems_clients_commercial_stage_check
  CHECK (commercial_stage IS NULL OR commercial_stage IN ('mapeado','contato','demonstracao','avaliacao','negociacao','ganho','perdido','pausado'));

CREATE INDEX IF NOT EXISTS idx_systems_clients_commercial
  ON public.systems_clients (tenant_id, parent_company_id, lifecycle, commercial_stage);
CREATE INDEX IF NOT EXISTS idx_systems_clients_next_action
  ON public.systems_clients (tenant_id, next_action_at) WHERE lifecycle = 'prospect';
CREATE INDEX IF NOT EXISTS idx_systems_clients_current_system
  ON public.systems_clients (tenant_id, current_system) WHERE lifecycle = 'prospect';

ALTER TABLE public.client_touchpoints DROP CONSTRAINT IF EXISTS client_touchpoints_touchpoint_type_check;
ALTER TABLE public.client_touchpoints ADD CONSTRAINT client_touchpoints_touchpoint_type_check
  CHECK (touchpoint_type = ANY (ARRAY['solicitacao','visita','reuniao','ligacao','mensagem','treinamento','entrega','feedback','demonstracao','implantacao','outro']));