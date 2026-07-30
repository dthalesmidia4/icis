## Problema confirmado no código

Três defeitos independentes, todos em `src/lib/reorderSequence.ts` + `src/components/kanban/ReorderSequenceModal.tsx`:

1. **A duração não acompanha a hora digitada.** O campo "Duração (min)" é um valor solto: ao abrir o "Ajustar" ele recebe a duração calculada e nunca é recalculado quando você muda data/hora. Aplicando 17:00 com "260" herdado, o motor reserva 260 minutos a partir dali — sem considerar que a janela útil daquele início é outra.
2. **O ajuste manual cancela o estado "em execução".** O motor só reconhece o card atrasado/em andamento quando **não** existe ajuste manual. Ao aplicar 17:00, o card perde a preservação do início histórico, passa a ser tratado como tarefa nova iniciando em 28/07 17:00 e o término cai em 29/07 13:50 — no passado, já que hoje é 30/07.
3. **Nada impede propostas no passado.** O cursor da fila continua a partir do término do card ajustado, então os cards seguintes herdaram 29/07 — datas já vencidas.

## Correções

### A. Duração derivada, não digitada às cegas
- Ao alterar **Início** (data ou hora), a duração é recalculada automaticamente pela mesma regra do motor: estimativa tipo × etapa, extensão por atraso quando aplicável, e reencaixe nos blocos de expediente/área daquele dia.
- O campo passa a ter dois modos: **Automática** (padrão, exibe o valor calculado em cinza e o rótulo "auto") e **Manual**, ativado só quando você digita nele. Um botão "voltar para automática" restaura.
- Rótulo do campo passa a explicitar a base: "Duração — ajustada ao expediente e à área".

### B. Em cards em execução, o ajuste edita o TÉRMINO
- Para o card marcado como "Em execução desde …", o formulário deixa de pedir novo início (que não deve mudar) e pede **Novo término** (data + hora).
- O início histórico é preservado; a duração exibida passa a ser o tempo útil entre agora e o término escolhido.
- O motor ganha suporte a `endISO`/`endTime` no ajuste manual e deixa de descartar o estado "em execução" quando existe ajuste — assim a leitura permanece `término antigo → término novo`.

### C. Nenhuma proposta no passado
- Todo início fixado manualmente é limitado ao primeiro horário útil a partir do instante-base; se o valor digitado for anterior, ele é deslocado e o card recebe o aviso "Ajuste anterior ao horário atual — movido para o próximo horário útil".
- Todo término fixado manualmente precisa ser posterior ao instante-base; caso contrário o ajuste é rejeitado com mensagem clara no modal.
- O cursor da fila nunca retrocede: os cards seguintes partem sempre do maior valor entre o término do card anterior e o instante-base — eliminando as datas de 29/07 na sequência.

### D. Leitura do "Proposto"
- Cards em execução: `Novo término: <antigo riscado> → <novo>`, com o início histórico exibido separadamente (já é o formato desejado; passa a se manter também depois do ajuste).
- Cards normais: mantém `Anterior: início → fim` / `Proposto: início → fim`.
- O selo "ajustado" indica se o ajuste foi de início ou de término.

## Detalhes técnicos

- `ReorderManualOverride`: adicionar `endISO?`, `endTime?`; `durationMin` continua opcional e só é usado quando o usuário optar por manual.
- `computeReorder`: remover `!manual` da condição `inProgressFirst`; tratar `pinnedStart` com clamp em `now` normalizado; novo caminho para `pinnedEnd` (calcula `dur` por `businessMinutesBetween(base, pinnedEnd)`); `cursor = max(end, nowNormalizado)` ao final de cada iteração; expor `pinnedKind: "start" | "end"` e o aviso de clamp em `ReorderProposal`.
- `ReorderSequenceModal`: estado `draft` ganha `mode: "auto" | "manual"` para duração e `endDate/endTime` para cards em execução; validação antes de aplicar; sincronização do rascunho com a proposta recalculada mantida.

## Validação

- Card atrasado em `planejar` (28/07 14:35 → 30/07 14:00): ajuste de término para 31/07 09:45 mantém início 28/07 e recalcula duração; nenhum card seguinte cai antes de 30/07.
- Ajuste de início para uma hora passada: deslocado para o próximo horário útil com aviso.
- Ajuste de início em card normal: duração recalcula sozinha; digitar duração fixa o valor até clicar em "voltar para automática".
