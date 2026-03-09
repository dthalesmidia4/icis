
-- Create bills_payable table
CREATE TABLE public.bills_payable (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  due_date date NOT NULL,
  observations text,
  attachment_url text,
  attachment_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.bills_payable ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "tenant_access_bills_payable" ON public.bills_payable
  FOR ALL
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR user_has_tenant_access(auth.uid(), tenant_id)
  );

-- Create storage bucket for bill attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('bill-attachments', 'bill-attachments', true);

-- Storage policies
CREATE POLICY "tenant_upload_bill_attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bill-attachments');

CREATE POLICY "public_read_bill_attachments" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'bill-attachments');

CREATE POLICY "tenant_delete_bill_attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bill-attachments');
