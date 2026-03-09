
CREATE TABLE public.tool_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  due_date date NOT NULL,
  card_used text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  subscription_date date,
  observations text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tool_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_tool_expenses" ON public.tool_expenses
  AS RESTRICTIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
