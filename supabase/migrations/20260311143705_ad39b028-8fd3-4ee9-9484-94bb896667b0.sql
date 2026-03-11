
CREATE TABLE public.employee_progress_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_progress_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_employee_progress" ON public.employee_progress_history
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX idx_employee_progress_employee ON public.employee_progress_history(employee_id, created_at DESC);
CREATE INDEX idx_employee_progress_tenant ON public.employee_progress_history(tenant_id);
