
-- Normaliza demandas que ficaram com Conteúdo + Instruções + CTA concatenados
-- em "instructions" e com "description" vazia.
-- Recompõe a partir do JSON do período (single source of truth do snapshot).

with src as (
  select d.id as demand_id,
         d.title,
         d.instructions as old_instructions,
         elem
    from public.demands d
    join public.period_plans p on p.id = d.period_plan_id
    cross join lateral (
      select e from jsonb_array_elements(coalesce(p.default_plan, '[]'::jsonb)) e
      union all
      select e from jsonb_array_elements(coalesce(p.ultra_plan,   '[]'::jsonb)) e
      union all
      select e from jsonb_array_elements(coalesce(p.final_plan,   '[]'::jsonb)) e
    ) j(elem)
   where d.archived_at is null
     and (d.description is null or btrim(d.description) = '')
     and d.instructions is not null
     and (elem->>'titulo' = d.title or elem->>'title' = d.title)
),
ranked as (
  select demand_id,
         elem->>'conteudo'              as conteudo,
         elem->>'instrucoes_de_producao' as instrucoes,
         elem->>'cta_recomendado'        as cta,
         row_number() over (partition by demand_id order by 1) as rn
    from src
)
update public.demands d
   set description = coalesce(nullif(btrim(r.conteudo), ''), d.description),
       instructions = nullif(
         btrim(
           concat_ws(
             E'\n\n',
             nullif(btrim(coalesce(r.instrucoes, '')), ''),
             case when nullif(btrim(coalesce(r.cta, '')), '') is not null
                  then 'CTA: ' || btrim(r.cta) end
           )
         ), ''
       ),
       updated_at = now()
  from ranked r
 where r.rn = 1
   and d.id = r.demand_id;
