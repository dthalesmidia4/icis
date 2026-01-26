-- Criar função de validação para roles de convites
CREATE OR REPLACE FUNCTION public.validate_invitation_role()
RETURNS TRIGGER AS $$
DECLARE
  valid_roles text[] := ARRAY['agency_admin', 'agency_manager', 'agency_user'];
BEGIN
  -- Verificar se a role é válida para novos convites
  IF NOT (NEW.role::text = ANY(valid_roles)) THEN
    RAISE EXCEPTION 'Role inválida para convite: %. Roles permitidas: agency_admin, agency_manager, agency_user', NEW.role;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar trigger para validar role na inserção de convites
DROP TRIGGER IF EXISTS validate_invitation_role_trigger ON public.invitations;
CREATE TRIGGER validate_invitation_role_trigger
  BEFORE INSERT ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invitation_role();