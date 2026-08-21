CREATE TABLE public.office_desk_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  objects jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_desk_preferences TO authenticated;
GRANT ALL ON public.office_desk_preferences TO service_role;

ALTER TABLE public.office_desk_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_view_desk_prefs"
ON public.office_desk_preferences FOR SELECT TO authenticated
USING (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "users_insert_own_desk_prefs"
ON public.office_desk_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "users_update_own_desk_prefs"
ON public.office_desk_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.user_has_tenant_access(auth.uid(), tenant_id))
WITH CHECK (user_id = auth.uid() AND public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "users_delete_own_desk_prefs"
ON public.office_desk_preferences FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER update_office_desk_preferences_updated_at
BEFORE UPDATE ON public.office_desk_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();