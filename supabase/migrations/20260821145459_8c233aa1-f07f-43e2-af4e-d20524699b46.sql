CREATE OR REPLACE FUNCTION public.storage_path_access_allowed(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH segs AS (
    SELECT unnest(string_to_array(coalesce(_object_name, ''), '/')) AS seg
  ),
  ids AS (
    SELECT (regexp_replace(seg, '\.[A-Za-z0-9]+$', ''))::uuid AS id
    FROM segs
    WHERE regexp_replace(seg, '\.[A-Za-z0-9]+$', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM ids
    WHERE ids.id = auth.uid()
       OR public.user_has_tenant_access(auth.uid(), ids.id)
       OR EXISTS (
            SELECT 1 FROM public.tenant_companies tc
            WHERE tc.id = ids.id
              AND public.user_has_tenant_access(auth.uid(), tc.tenant_id)
          )
       OR EXISTS (
            SELECT 1 FROM public.demands d
            WHERE d.id = ids.id
              AND public.user_has_tenant_access(auth.uid(), d.tenant_id)
          )
  );
$$;

REVOKE ALL ON FUNCTION public.storage_path_access_allowed(text) FROM public;
GRANT EXECUTE ON FUNCTION public.storage_path_access_allowed(text) TO authenticated, service_role;

-- FINDING 1: bill-attachments tinha leitura pública/anônima.
DROP POLICY IF EXISTS "public_read_bill_attachments" ON storage.objects;
DROP POLICY IF EXISTS "tenant_upload_bill_attachments" ON storage.objects;
DROP POLICY IF EXISTS "tenant_delete_bill_attachments" ON storage.objects;

CREATE POLICY "bill_attachments_tenant_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bill-attachments' AND public.storage_path_access_allowed(name));

CREATE POLICY "bill_attachments_tenant_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bill-attachments' AND public.storage_path_access_allowed(name));

CREATE POLICY "bill_attachments_tenant_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'bill-attachments' AND public.storage_path_access_allowed(name))
WITH CHECK (bucket_id = 'bill-attachments' AND public.storage_path_access_allowed(name));

CREATE POLICY "bill_attachments_tenant_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'bill-attachments' AND public.storage_path_access_allowed(name));

-- FINDING 2: escritas sem verificação de posse.
DROP POLICY IF EXISTS "Authenticated users can upload card attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their card attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete card attachments" ON storage.objects;

CREATE POLICY "card_attachments_scoped_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'card-attachments' AND public.storage_path_access_allowed(name));

CREATE POLICY "card_attachments_scoped_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'card-attachments' AND public.storage_path_access_allowed(name))
WITH CHECK (bucket_id = 'card-attachments' AND public.storage_path_access_allowed(name));

CREATE POLICY "card_attachments_scoped_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'card-attachments' AND public.storage_path_access_allowed(name));

DROP POLICY IF EXISTS "Allow authenticated uploads to company-logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to company-logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from company-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their logos" ON storage.objects;

CREATE POLICY "company_logos_scoped_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (public.storage_path_access_allowed(name) OR name LIKE 'logos/%')
);

CREATE POLICY "company_logos_scoped_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos' AND public.storage_path_access_allowed(name))
WITH CHECK (bucket_id = 'company-logos' AND public.storage_path_access_allowed(name));

CREATE POLICY "company_logos_scoped_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-logos' AND public.storage_path_access_allowed(name));

DROP POLICY IF EXISTS "Authenticated users can upload mascot images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update mascot images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete mascot images" ON storage.objects;

CREATE POLICY "mascot_images_scoped_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'mascot-images' AND public.storage_path_access_allowed(name));

CREATE POLICY "mascot_images_scoped_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'mascot-images' AND public.storage_path_access_allowed(name))
WITH CHECK (bucket_id = 'mascot-images' AND public.storage_path_access_allowed(name));

CREATE POLICY "mascot_images_scoped_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'mascot-images' AND public.storage_path_access_allowed(name));