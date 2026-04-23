

# Diagnóstico e correção dos prompts não retornados

## O que está acontecendo

Você relatou dois pontos:

1. **"Plano de Marketing — `generate_marketing_plan_prompt` ⚠️ Não retornado"**
2. **"Não retornado (pode usar `generate_posts_prompt` como fallback no código)"**

### Auditoria feita

Listei o que existe hoje no banco (`system_prompts`) e o que cada Edge Function realmente busca:

| Prompt salvo no banco | Chave real | Function que consome | Status |
|---|---|---|---|
| Prompt de Geração de Plano de Marketing | `generate_plan_prompt` (5858 chars, 22/04) | `generate-period-plans` | ✅ Funcionando |
| Prompt de Planejamento Avançado | `advanced_planning_prompt` (5073 chars) | `generate-period-plans` (apenas plano ultra) | ✅ Funcionando |
| Prompt Gerador de Carrossel | `custom_prompt_1774297057852` (4446 chars, 17/04) | nenhuma — functions buscam `generate_carousel_prompt` | ❌ Não consumido |
| Prompt de Geração de Posts | `generate_posts_prompt` (4443 chars) | post + carrossel (conteúdo + imagens) | ✅ Funcionando |

### Causa real dos avisos

- A chave `generate_marketing_plan_prompt` **não existe e nunca existiu**. O nome correto é **`generate_plan_prompt`**, que JÁ está integrado e funcionando desde o último ajuste. Não há nada quebrado aqui — é só um nome diferente do que a tela de auditoria estava esperando.
- O alerta de "fallback para `generate_posts_prompt`" se refere ao **prompt de carrossel**: a function `auto-generate-carousel` procura uma chave (`generate_carousel_prompt`) que não existe no banco, então cai num bloco hardcoded. Suas edições no "Prompt Gerador de Carrossel" (chave `custom_prompt_1774297057852`) **não estão chegando à IA**.

---

## Correções propostas

### Correção 1 — Reconhecer `generate_plan_prompt` como o "Plano de Marketing"
Sem mudança de código necessária. Apenas confirmar: a chave oficial usada pelo sistema é `generate_plan_prompt`. Se houver alguma tela/relatório procurando `generate_marketing_plan_prompt`, ajusto para apontar para a chave correta.

### Correção 2 — Conectar o Prompt Gerador de Carrossel
Alterar `supabase/functions/auto-generate-carousel/index.ts` para buscar a chave real onde o prompt está salvo:

- Buscar em paralelo as duas chaves (`generate_carousel_prompt` E `custom_prompt_1774297057852`).
- Usar a primeira que tiver conteúdo.
- Se nenhuma existir, manter o fallback hardcoded atual.

Isso faz com que suas edições salvas em **/dev/prompts → Prompt Gerador de Carrossel** passem a ser efetivamente aplicadas na geração automática de carrosséis.

### Correção 3 — Validação no console
Adicionar um log claro no `auto-generate-carousel` informando qual chave foi carregada (ex.: `📋 Carrossel usando: custom_prompt_1774297057852`), para que futuras auditorias mostrem a origem real do prompt.

---

## Resumo após as correções

| Etapa | Prompt aplicado | Origem |
|---|---|---|
| Plano de período (comum) | `generate_demandas_prompt` + `generate_plan_prompt` | Banco |
| Plano de período (ultra) | acima + `advanced_planning_prompt` | Banco |
| Geração de Post | `generate_posts_prompt` | Banco |
| Geração de Carrossel (texto) | `generate_posts_prompt` | Banco (já funciona) |
| Geração de Carrossel (auto) | `custom_prompt_1774297057852` | Banco (passará a funcionar) |
| Imagens dos slides | `generate_posts_prompt` | Banco |

Após sua aprovação, aplico apenas as Correções 2 e 3 (a 1 não exige código).

