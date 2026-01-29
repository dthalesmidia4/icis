
# Plano: Corrigir Sistema de Geração Adaptativa

## Resumo dos Problemas Encontrados

1. **Calendário de 2025 para planejamentos de 2026**: A tabela `br_calendar_events` só possui datas de 2025, mas os planejamentos são para 2026
2. **Fingerprints vazios**: Os fingerprints estão sendo inseridos como strings vazias ao invés de calculados
3. **Falta validação pós-geração**: Não há mecanismo que bloqueie demandas repetidas após a IA gerar
4. **IA ignora instruções**: As instruções são apenas texto - a IA pode ignorar e repetir ideias

---

## Solução Proposta

### Fase 1: Atualizar Calendário para 2026

Adicionar datas comemorativas de 2026 à tabela `br_calendar_events`:

```sql
-- Feriados e datas de 2026
INSERT INTO br_calendar_events VALUES
('2026-01-01', 'Ano Novo', 'holiday', 90, ...),
('2026-02-14', 'Carnaval', 'holiday', 95, ...),
('2026-03-08', 'Dia Internacional da Mulher', 'marketing', 90, ...),
...
```

**Inclui**: Carnaval 2026, Dia das Mães 2026, Black Friday 2026, etc.

---

### Fase 2: Corrigir Geração de Fingerprints

**Problema**: O código insere `fingerprint: ''` ao invés de calcular

**Solução**: Chamar a função `generate_demand_fingerprint` antes de inserir:

```typescript
// ANTES (incorreto)
await supabase.from('demand_fingerprints').insert({
  fingerprint: '' // VAZIO!
});

// DEPOIS (correto)  
const fingerprint = await generateFingerprint(title, demand_type, channel);
await supabase.from('demand_fingerprints').insert({
  fingerprint: fingerprint
});
```

**OU** criar um trigger no banco que calcule automaticamente o fingerprint no INSERT.

---

### Fase 3: Implementar Validação Pós-Geração

Adicionar um passo de **deduplicação programática** após a IA gerar:

```typescript
// Após receber resposta da IA
const generatedDemands = plans.default_plan;

// Buscar fingerprints existentes
const existingFingerprints = await supabase
  .from('demand_fingerprints')
  .select('fingerprint, title')
  .eq('client_id', clientId);

// Filtrar demandas duplicadas
const uniqueDemands = generatedDemands.filter(demand => {
  const fp = generateFingerprint(demand.titulo, demand.tipo, demand.canal);
  const isDuplicate = existingFingerprints.some(e => e.fingerprint === fp);
  if (isDuplicate) {
    console.log(`⚠️ Demanda duplicada removida: ${demand.titulo}`);
  }
  return !isDuplicate;
});

// Substituir demandas removidas por novas (opcional)
if (uniqueDemands.length < generatedDemands.length) {
  // Pedir mais demandas à IA ou aceitar menos
}
```

---

### Fase 4: Melhorar Contexto Enviado à IA

Tornar as instruções mais **imperativas** e incluir os títulos exatos a evitar:

```typescript
// Ao invés de sugestão vaga:
"EVITAR demandas recentes..."

// Usar lista explícita e BLOQUEANTE:
`
⛔ TÍTULOS PROIBIDOS (NÃO USAR NENHUM DESTES):
- "Fluxo de Caixa em 5 minutos" ← JÁ USADO
- "5 perguntas que você não faz pro contador" ← JÁ USADO
- "Transforme relatório em ação" ← JÁ USADO

Se gerar qualquer demanda com título igual ou muito similar, 
a demanda será AUTOMATICAMENTE REJEITADA.
`
```

---

## Tarefas Técnicas

| # | Tarefa | Arquivo |
|---|--------|---------|
| 1 | Criar migration para adicionar eventos do calendário 2026 | `supabase/migrations/` |
| 2 | Adicionar trigger para calcular fingerprint automaticamente | `supabase/migrations/` |
| 3 | Implementar validação pós-geração na Edge Function | `supabase/functions/generate-period-plans/index.ts` |
| 4 | Melhorar prompt com lista explícita de títulos proibidos | `supabase/functions/generate-period-plans/index.ts` |
| 5 | Adicionar fallback: se IA repetir, regenerar automaticamente | `supabase/functions/generate-period-plans/index.ts` |

---

## Resultado Esperado

Após as correções:

1. ✅ Datas comemorativas de Fev/Mar 2026 aparecem (Carnaval, Dia da Mulher, etc.)
2. ✅ Fingerprints são calculados corretamente ao inserir
3. ✅ Demandas duplicadas são **removidas programaticamente** mesmo se a IA ignorar instruções
4. ✅ Cada planejamento terá conteúdo genuinamente diferente
5. ✅ Sistema aprende e melhora com cada iteração
