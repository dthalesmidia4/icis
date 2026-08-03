ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS manager_work_area public.work_area;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS manager_work_area public.work_area;

CREATE OR REPLACE FUNCTION public.use_invitation(_code text, _user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  inv record;
BEGIN
  SELECT * INTO inv FROM public.invitations
  WHERE code = _code
    AND used_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite inválido ou expirado');
  END IF;

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

  UPDATE public.invitations
  SET used_by = _user_id, used_at = now()
  WHERE id = inv.id;

  INSERT INTO public.user_roles (user_id, tenant_id, role, manager_work_area)
  VALUES (_user_id, inv.tenant_id, inv.role, inv.manager_work_area);

  UPDATE public.profiles
  SET tenant_id = inv.tenant_id
  WHERE id = _user_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', inv.tenant_id,
    'role', inv.role
  );
END;
$function$;