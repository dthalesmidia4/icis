DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.finance_items_enc_insert()',
    'public.finance_items_enc_update()',
    'public.finance_occurrences_enc_insert()',
    'public.finance_occurrences_enc_update()',
    'public.tenants_enc_insert()',
    'public.tenants_enc_update()',
    'public.guard_tenant_finance_fields()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
  END LOOP;
END $$;