
-- Create table for storing multiple mascot reference images per client
CREATE TABLE public.company_mascot_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  file_name TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_mascot_images ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "tenant_access_mascot_images"
ON public.company_mascot_images
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_tenant_access(auth.uid(), tenant_id)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_tenant_access(auth.uid(), tenant_id)
);

-- Create index for faster lookups
CREATE INDEX idx_mascot_images_company ON public.company_mascot_images(company_id);

-- Storage bucket for mascot images
INSERT INTO storage.buckets (id, name, public) VALUES ('mascot-images', 'mascot-images', true);

-- Storage policies
CREATE POLICY "Anyone can view mascot images"
ON storage.objects FOR SELECT
USING (bucket_id = 'mascot-images');

CREATE POLICY "Authenticated users can upload mascot images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mascot-images');

CREATE POLICY "Authenticated users can update mascot images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'mascot-images');

CREATE POLICY "Authenticated users can delete mascot images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mascot-images');
