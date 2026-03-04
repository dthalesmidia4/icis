
-- Table to store which users receive late demand notifications
CREATE TABLE public.user_late_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE public.user_late_notification_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "admins_manage_late_notifications" ON public.user_late_notification_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR is_agency_admin(tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR is_agency_admin(tenant_id));

-- Users can read their own setting
CREATE POLICY "users_view_own_late_notifications" ON public.user_late_notification_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
