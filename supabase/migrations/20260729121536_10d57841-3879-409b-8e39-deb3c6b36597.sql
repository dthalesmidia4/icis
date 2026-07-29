-- Backfill: move 3 cards que a Lúcia descartou em 28/07 mas não gravaram
-- (bug do modal de exigências) para rejected_plan como _discarded.

DO $$
DECLARE
  v_period_id uuid := '2f4e9f93-4601-4d9d-9906-2587d24764d5';
  v_default jsonb;
  v_ultra jsonb;
  v_rejected jsonb;
  v_item jsonb;
  v_now text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_titles_default text[] := ARRAY['Nos Bastidores do Leal: Conheça Nossa Equipe de Plantão 24h'];
  v_titles_ultra text[] := ARRAY[
    'Hospital Veterinário Leal – Erros comuns no pós‑op e como evitá‑los (guia rápido)',
    'Hospital Veterinário Leal – O que o mascote Dr. Leal ensinaria ao tutor em 5 frases'
  ];
  t text;
BEGIN
  SELECT default_plan, ultra_plan, rejected_plan
    INTO v_default, v_ultra, v_rejected
    FROM public.period_plans WHERE id = v_period_id;

  IF v_rejected IS NULL THEN v_rejected := '[]'::jsonb; END IF;

  -- Default
  FOREACH t IN ARRAY v_titles_default LOOP
    SELECT value INTO v_item FROM jsonb_array_elements(v_default) WITH ORDINALITY x(value, ord)
      WHERE trim(coalesce(value->>'titulo', value->>'title', '')) = t
      LIMIT 1;
    IF v_item IS NOT NULL THEN
      v_default := (
        SELECT coalesce(jsonb_agg(value), '[]'::jsonb) FROM jsonb_array_elements(v_default) value
        WHERE trim(coalesce(value->>'titulo', value->>'title', '')) <> t
      );
      v_rejected := v_rejected || jsonb_build_array(
        v_item
        || jsonb_build_object(
          '_originalSource', 'default',
          '_rejectedAt', v_now,
          '_discarded', true,
          '_discardedAt', v_now,
          '_rejectReason', 'Descarte manual — backfill 28/07 (bug do modal de exigências)'
        )
      );
      v_item := NULL;
    END IF;
  END LOOP;

  -- Ultra
  FOREACH t IN ARRAY v_titles_ultra LOOP
    SELECT value INTO v_item FROM jsonb_array_elements(v_ultra) WITH ORDINALITY x(value, ord)
      WHERE trim(coalesce(value->>'titulo', value->>'title', '')) = t
      LIMIT 1;
    IF v_item IS NOT NULL THEN
      v_ultra := (
        SELECT coalesce(jsonb_agg(value), '[]'::jsonb) FROM jsonb_array_elements(v_ultra) value
        WHERE trim(coalesce(value->>'titulo', value->>'title', '')) <> t
      );
      v_rejected := v_rejected || jsonb_build_array(
        v_item
        || jsonb_build_object(
          '_originalSource', 'ultra',
          '_rejectedAt', v_now,
          '_discarded', true,
          '_discardedAt', v_now,
          '_rejectReason', 'Descarte manual — backfill 28/07 (bug do modal de exigências)'
        )
      );
      v_item := NULL;
    END IF;
  END LOOP;

  UPDATE public.period_plans
     SET default_plan = v_default,
         ultra_plan = v_ultra,
         rejected_plan = v_rejected,
         updated_at = now()
   WHERE id = v_period_id;
END $$;