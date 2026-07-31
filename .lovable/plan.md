## 1. Bug: tempo de "Editar vídeo" compartilhado entre Vídeo captado e Vídeo gerado

Causa confirmada: as durações não são salvas por tipo de demanda, e sim por **grupo**. Em `src/lib/reorderSequence.ts`, `Vídeo captado` e `Vídeo gerado` caem no mesmo grupo `video_curto` (`typeGroup()` / `groupForDemandTypeKey()`), então editar uma célula grava em `flow_functions.config.durations[etapa].video_curto` e as duas linhas mudam juntas.

Correção (compatível com o que já está salvo):
- Passar a gravar em uma nova chave por tipo: `config.durations_by_type[<demand_type_key>]` (ex.: `video_gerado`, `video_captado`, `criativo_estatico`, `carrossel`, `anuncio`, `outro`).
- Ordem de leitura em todo consumo de duração: `durations_by_type[tipo]` → `durations[grupo]` (legado) → `DURATION_MATRIX` hardcoded. Nada precisa ser migrado; valores antigos continuam valendo como fallback.
- Arquivos afetados: `src/components/FunctionPermissionsModal.tsx` (edição, reset por tipo e os totais "Total produção"/"Total do ciclo"), `src/lib/flowDurations.ts` (`loadDurationsForTenant`, `loadDurationsByArea`, `resolveDurationMinutes`), `src/lib/reorderSequence.ts` (`pickFromOverrides` e o cálculo de duração da etapa passam a receber o `demand_type_key` do card, não só o grupo).
- Efeito: a tabela e o motor de reorganização passam a usar exatamente o mesmo número por (área × tipo × etapa), inclusive nas duas linhas de vídeo separadamente.

## 2. Feedback: por que o card foi para 03/08 09:20

Hoje o modal só diz "+20min" e o novo término, sem explicar que o motivo é a **alocação de área do colaborador** (Letícia não tem Mídia alocada à tarde), o que faz o cálculo pular para o próximo bloco disponível.

- O motor passa a devolver, por card, o motivo do salto: `jumpReason` com o bloco usado e a lacuna (`sem janela de Mídia após 12:00 nesta data`, `fim de semana`, `feriado`, `fora do expediente`).
- No card do modal, quando o término cai em outro dia, aparece uma linha explicativa: "Letícia tem **Mídia** alocada apenas 09:00–12:00 nesta data — próximo horário livre: seg 03/08 09:20." Com link/atalho para a aba **Alocação por área** das configurações de fluxo.
- Quando não há bloco algum da área para o colaborador, a mensagem é explícita ("nenhuma janela de Mídia configurada") em vez de simplesmente empurrar a data.

## 3. Redesenho do modal "Reorganizar sequência"

Mantendo 100% das funcionalidades (ajuste manual com cascata, +folga, pinos, recalcular, aplicar, cards não reagendados):

- **Cabeçalho enxuto**: título + coluna, e o parágrafo longo de explicação vira um botão "Como isto é calculado?" (popover) com janela de trabalho, almoço, feriados e regras de exceção. Os chips `Total / Reagendados / com aviso` ficam, mais compactos, junto de `base 14:28 · recalcular`.
- **Nome da etapa sempre visível**: cada card mostra `Etapa: Editar vídeo · Vídeo gerado` (etapa + tipo de demanda). Fim de "etapa ~30min" sem contexto — passa a ser "Editar vídeo: 30min estimados, 30min já usados".
- **Fim da redundância**: hoje o mesmo fato aparece 3 vezes (badge "risco de atraso", linha "faltam 0min" e o aviso amarelo "Atrasado: extensão de 30%"). Passa a existir **uma** linha de status por card, com ícone e cor: `Atrasado — estendido +20min (30% da etapa)` ou `No prazo — folga 32min`.
- **Estrutura de cada card em 3 blocos fixos**: (1) posição + título + tipo/etapa; (2) horário — `31/07 11:00 → 03/08 09:20` com o valor antigo riscado só quando muda; (3) status/motivo em uma linha, mais os botões `Ajustar` / `+folga`.
- **Cards não reagendados** (Captar, Aguardando cliente, diários) ganham visual atenuado e selo `Fixo` com o motivo curto, separados visualmente dos que serão alterados.
- **Ordem e legibilidade**: badges de tier (`Produção`/`Revisão`) ficam discretos; o motivo da ordenação (`em execução`, `risco`, `normal`, `recém-chegado`) aparece como texto pequeno em vez de badge colorido competindo com o status.
- Nenhuma mudança na lógica de cálculo além do `jumpReason`; a reordenação em si permanece a já aprovada.

## Detalhes técnicos

- `ReorderProposal` recebe: `stageKey`, `stageLabel`, `demandTypeLabel`, `jumpReason` (`{ kind, areaLabel, lastBlockEnd, nextAvailableISO }`).
- Assinaturas alteradas: `pickFromOverrides(overrides, stage, group, area, demandTypeKey)` e `resolveDurationMinutes(overrides, stage, group, demandTypeKey)` — chamadores atualizados (`buildReturnFromClientDates`, `ReorderSequenceModal`, `KanbanCentralPage`).
- Sem migração de banco: apenas nova chave dentro do `jsonb` `flow_functions.config`.
