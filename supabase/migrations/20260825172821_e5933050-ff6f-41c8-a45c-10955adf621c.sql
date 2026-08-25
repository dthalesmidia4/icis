-- Status SEGURO da fatura do cartão para o escopo `Assinaturas e ferramentas`.
-- Devolve APENAS apresentação: existência, vencimento e fato de pagamento.
-- NUNCA valores, limite, orçamento, câmbio, anexos ou observações.
CREATE OR REPLACE FUNCTION public.list_finance_safe_card_statement_status(
  _tenant_id uuid,
  _competence_month date
)
RETURNS TABLE(
  card_id uuid,
  competence_month date,
  due_date date,
  paid boolean,
  paid_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _tenant_id IS NULL OR _competence_month IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.has_finance_tools_access(_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para Assinaturas e ferramentas';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (fi.id)
         fi.id                            AS card_id,
         fo.competence_month::date         AS competence_month,
         fo.due_date::date                 AS due_date,
         (fo.paid_at IS NOT NULL)          AS paid,
         fo.paid_at                        AS paid_at
  FROM public.finance_occurrences fo
  JOIN public.finance_items fi
    ON fi.id = fo.item_id
   AND fi.tenant_id = fo.tenant_id
  WHERE fo.tenant_id = _tenant_id
    AND fi.kind = 'card'
    AND date_trunc('month', fo.competence_month)::date
        = date_trunc('month', _competence_month)::date
  ORDER BY fi.id, (fo.paid_at IS NOT NULL) DESC, fo.updated_at DESC NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_finance_safe_card_statement_status(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_finance_safe_card_statement_status(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_finance_safe_card_statement_status(uuid, date) TO authenticated, service_role;