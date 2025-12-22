-- Add logo_url column to tenant_companies table
ALTER TABLE public.tenant_companies 
ADD COLUMN logo_url text;

-- Create storage policy for company-logos bucket if not exists
DO $$
BEGIN
  -- Allow authenticated users to upload to company-logos bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow authenticated uploads to company-logos' 
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow authenticated uploads to company-logos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'company-logos');
  END IF;

  -- Allow authenticated users to update their uploads
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow authenticated updates to company-logos' 
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow authenticated updates to company-logos"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'company-logos');
  END IF;

  -- Allow authenticated users to delete their uploads
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow authenticated deletes from company-logos' 
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow authenticated deletes from company-logos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'company-logos');
  END IF;

  -- Allow public read access to company-logos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Allow public read access to company-logos' 
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read access to company-logos"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'company-logos');
  END IF;
END $$;