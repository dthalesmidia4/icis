-- Tabela de convites
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_by uuid NOT NULL,
  email text, -- opcional: limita o convite a um email específico
  used_by uuid,
  used_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: apenas super_admin pode gerenciar convites
CREATE POLICY "super_admins_manage_invitations"
ON public.invitations
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Permitir que usuários não autenticados validem convites pelo código (para cadastro)
CREATE POLICY "anyone_can_validate_invitation"
ON public.invitations
FOR SELECT
USING (code IS NOT NULL AND used_at IS NULL AND expires_at > now());

-- Trigger para updated_at
CREATE TRIGGER update_invitations_updated_at
BEFORE UPDATE ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Função para gerar código único de 8 caracteres
CREATE OR REPLACE FUNCTION public.generate_invitation_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := upper(substring(md5(random()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM public.invitations WHERE code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Função para usar um convite (chamada após cadastro)
CREATE OR REPLACE FUNCTION public.use_invitation(_code text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv record;
BEGIN
  -- Buscar convite válido
  SELECT * INTO inv FROM public.invitations
  WHERE code = _code 
    AND used_at IS NULL 
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite inválido ou expirado');
  END IF;
  
  -- Verificar se email específico foi definido
  IF inv.email IS NOT NULL THEN
    DECLARE
      user_email text;
    BEGIN
      SELECT email INTO user_email FROM auth.users WHERE id = _user_id;
      IF user_email != inv.email THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este convite é destinado a outro email');
      END IF;
    END;
  END IF;
  
  -- Marcar convite como usado
  UPDATE public.invitations 
  SET used_by = _user_id, used_at = now() 
  WHERE id = inv.id;
  
  -- Criar role do usuário
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_user_id, inv.tenant_id, inv.role);
  
  -- Atualizar tenant_id do profile
  UPDATE public.profiles 
  SET tenant_id = inv.tenant_id 
  WHERE id = _user_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'tenant_id', inv.tenant_id, 
    'role', inv.role
  );
END;
$$;