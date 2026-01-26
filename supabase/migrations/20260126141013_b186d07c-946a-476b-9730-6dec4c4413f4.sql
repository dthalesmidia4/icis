-- CORREÇÃO: Criar função use_invitation_v2 com tipo TEXT ao invés de agency_role
-- (A função anterior falhou por referência de tipo inválida no PL/pgSQL)

CREATE OR REPLACE FUNCTION public.use_invitation_v2(_code TEXT, _user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
  role_text TEXT;
BEGIN
  -- Buscar convite válido
  SELECT * INTO inv FROM invitations
  WHERE code = _code 
    AND used_at IS NULL 
    AND expires_at > now()
    AND agency_id IS NOT NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite inválido ou expirado');
  END IF;
  
  -- Verificar se email específico foi definido
  IF inv.email IS NOT NULL THEN
    DECLARE
      user_email TEXT;
    BEGIN
      SELECT email INTO user_email FROM auth.users WHERE id = _user_id;
      IF user_email != inv.email THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este convite é destinado a outro email');
      END IF;
    END;
  END IF;
  
  -- Mapear role legado para novo enum
  IF inv.role::text IN ('agency_admin', 'super_admin') THEN
    role_text := 'agency_admin';
  ELSE
    role_text := 'agency_user';
  END IF;
  
  -- Marcar convite como usado
  UPDATE invitations 
  SET used_by = _user_id, used_at = now() 
  WHERE id = inv.id;
  
  -- Criar membership do usuário
  INSERT INTO agency_memberships (agency_id, user_id, role)
  VALUES (inv.agency_id, _user_id, role_text::agency_role)
  ON CONFLICT (agency_id, user_id) DO UPDATE SET role = role_text::agency_role;
  
  -- Atualizar agency_id do profile
  UPDATE profiles 
  SET agency_id = inv.agency_id 
  WHERE id = _user_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'agency_id', inv.agency_id, 
    'role', role_text
  );
END;
$$;