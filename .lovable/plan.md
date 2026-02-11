
# Fix: Demandas Nao Sendo Exibidas

## Problema Identificado

A edge function gera as demandas com sucesso (confirmado nos logs: 5 demandas retornadas, status 200). Porem, o frontend **ignora a resposta direta** da edge function e tenta buscar os dados via polling no banco de dados. Essa abordagem e fragil e esta falhando silenciosamente.

Alem disso, a interface `PlanItem` nao corresponde aos campos reais retornados pela IA (`tipo`, `objetivo`, `conteudo` vs `descricao`, `tipo_conteudo`).

## Solucao

### 1. Usar a resposta direta da Edge Function (principal)

**Arquivo:** `src/pages/PlanPeriod.tsx`

Modificar `generateSinglePlan` para usar os dados retornados diretamente pela `supabase.functions.invoke` em vez de polling:

```text
ANTES:
  1. Chama edge function (ignora resposta)
  2. Faz polling 40x no banco
  3. Nunca encontra ou demora muito

DEPOIS:
  1. Chama edge function
  2. Usa o campo 'plan' da resposta direta
  3. Polling apenas como fallback se resposta direta falhar
```

### 2. Corrigir a interface PlanItem

**Arquivo:** `src/pages/PlanPeriod.tsx`

Atualizar a interface `PlanItem` para incluir os campos reais retornados pela IA:

- Adicionar: `tipo`, `objetivo`, `conteudo`, `instrucoes_de_producao`, `cta_recomendado`
- Manter campos antigos como opcionais para retrocompatibilidade

### 3. Adicionar logs de debug

Adicionar `console.log` nos pontos criticos para facilitar depuracao futura:
- Resposta da edge function
- Dados recebidos antes de setar no state
- Quantidade de demandas no review

## Detalhes Tecnicos

### generateSinglePlan (refatorado)

```typescript
const generateSinglePlan = async (planId, planType) => {
  const { data, error } = await supabase.functions.invoke('generate-period-plans', {
    body: { periodPlanId: planId, tenantId, planType }
  });

  // Usar resposta direta se disponivel
  if (!error && data?.success && data?.plan?.length > 0) {
    console.log(`[PlanPeriod] Direct response: ${data.plan.length} demands`);
    return { success: true, plan: data.plan };
  }

  // Fallback: polling (caso a resposta direta falhe)
  console.warn('[PlanPeriod] Direct response failed, falling back to polling');
  // ... polling existente como fallback ...
};
```

### PlanItem interface (atualizada)

```typescript
interface PlanItem {
  titulo: string;
  tipo?: string;
  objetivo?: string;
  conteudo?: string;
  instrucoes_de_producao?: string;
  cta_recomendado?: string;
  canal: string;
  data_sugerida?: string;
  // Campos legados
  descricao?: string;
  tipo_conteudo?: string;
}
```

### Arquivos Modificados

- `src/pages/PlanPeriod.tsx` - Refatorar generateSinglePlan + corrigir PlanItem
- Nenhuma alteracao na edge function (ja funciona corretamente)
