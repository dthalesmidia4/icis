
CREATE TABLE public.employee_anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL,
  interviewer_id uuid NOT NULL,
  interview_date date NOT NULL DEFAULT CURRENT_DATE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  observer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_anamnesis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_employee_anamnesis" ON public.employee_anamnesis
  FOR ALL
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_tenant_access(auth.uid(), tenant_id)
  );

CREATE TRIGGER update_employee_anamnesis_updated_at
  BEFORE UPDATE ON public.employee_anamnesis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
