
# Duração por etapa editável no modal de fluxo

Hoje a matriz `DURATION_MATRIX` em `src/lib/reorderSequence.ts` é hardcoded (11 etapas × 6 grupos de tipo). Vou expô-la para edição no mesmo modal que já configura permissões, persistindo por tenant.

## 1. Persistência

Reutiliza a coluna `flow_functions.config` (jsonb) já existente. Cada linha guarda:
```json
{ "durations": { "estatico": 20, "carrossel": 40, "video_curto": 60, "video_longo": 90, "outro": 30 } }
```

Sem migração de schema. No load do modal, se `config.durations` estiver ausente, popula com os valores atuais do `DURATION_MATRIX` para que o usuário edite a partir do estado presente.

## 2. UI no `FunctionPermissionsModal`

Adiciona um segmento no topo do modal com duas abas: **Participação** (matriz Sim/Não atual) e **Tempo estimado**. Ao selecionar Tempo estimado, mostra a mesma matriz transposta — linhas = tipos de demanda, colunas = funções — com inputs numéricos (minutos) em cada célula ativa.

Regras da tabela de tempo:
- Só permite editar células onde a permissão é `required` na aba Participação (as demais aparecem cinza/desativadas com `—`).
- Cada célula é um input compacto (`w-16`, tipo number, step 5, min 1) com salvamento onBlur/debounce 500ms via `supabase.from("flow_functions").update({ config: {...} })`.
- Cabeçalho da coluna mostra o nome da função; rodapé de cada linha exibe o subtotal em minutos das etapas required para aquele tipo (dá noção do custo total do fluxo).
- Botão "Restaurar padrão" por linha (tipo de demanda) que reaplica os valores originais do `DURATION_MATRIX`.

## 3. Consumo em `reorderSequence.ts`

- Adiciona `durations?: Record<functionKey, Record<typeGroup, number>>` em `PlanReorderOptions`.
- `estimateDurationBase` passa a consultar primeiro o override do banco; cai no `DURATION_MATRIX` só se a célula não existir.
- `ReorderSequenceModal` (chamador) já busca `work_hours` — adiciono ao mesmo fetch um `select("function_key, config")` de `flow_functions` do tenant, monta o mapa e passa para `planReorder`.
- `estimateDurationMinutes` (usado fora do modal) mantém fallback hardcoded — não recebe overrides porque é síncrono; ok, é usado só para tooltips aproximados.

## 4. Realtime

O hook `useRealtimeFlowConfig` já observa `flow_functions`. Adiciono no `onChange` do modal um reload de durações (fora do save-eco), mesmo padrão da matriz de permissões.

## 5. Validação

- Test manual: alterar a duração de "criar_arte / estatico" de 20 para 45; rodar reordenar sequência e conferir que o card estático em criar_arte agora reserva 45min.
- Test manual: restaurar padrão de "outro"; conferir que valores voltam a 15/30/etc.
- Test manual: recarregar página e confirmar que os valores editados persistem (não voltam ao hardcoded).

## Detalhes técnicos

- Novo arquivo `src/lib/flowDurations.ts`: helpers `loadDurationsForTenant(tenantId)` e `resolveDurationMinutes(durations, stage, group)`.
- `FunctionPermissionsModal` recebe uma segunda `Tabs` do shadcn; sem alteração no fluxo de save da matriz de permissões existente.
- Sem novas policies/GRANTs — `flow_functions` já tem RLS e permissões.
