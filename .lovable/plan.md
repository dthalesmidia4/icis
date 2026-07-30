## Situação atual (confirmada no código)

Em `ReorderSequenceModal.tsx` o formulário "Ajustar" tem dois caminhos:

- Card em execução (`p.keepStart`): pede apenas **novo término** — correto, o início não deve mudar.
- Demais cards: pede **Início (data + hora)** e **Duração**. Não existe campo de término; a duração vem da estimativa do tipo (ex.: 3h) e só muda se você entrar no modo manual e digitar minutos.

Em `computeReorder` (`src/lib/reorderSequence.ts`), quando existe `startISO`, o `endISO` do ajuste é ignorado: o término é sempre `início + duração`.

## Correção

### 1. Campo de término nos cards não-em-execução
No formulário de ajuste dos cards posteriores, além de Início (data + hora), passam a existir **Término (data + hora)**, pré-preenchidos com a proposta atual.

- Ao mudar o término, a **duração passa a ser derivada** do intervalo útil entre início e término (expediente + área + folgas) e o campo Duração fica somente-leitura com rótulo "auto (derivada do término)".
- O modo Duração manual continua disponível: ao digitar minutos, o término é recalculado a partir do início e o campo de término fica derivado. Ou seja, você fixa **término OU duração** — o último editado manda, e um botão "voltar para automática" volta tudo à estimativa da etapa.

### 2. Validações
- Término precisa ser posterior ao início; caso contrário o ajuste é rejeitado com mensagem no modal.
- Término no passado (anterior ao instante-base) é rejeitado, como já ocorre nos cards em execução.
- Início anterior ao instante-base continua sendo deslocado para o próximo horário útil com aviso.

### 3. Motor de reorganização
- `computeReorder` passa a aceitar `startISO+startTime` **e** `endISO+endTime` no mesmo override: novo caminho `pinnedKind: "both"` — início fixado (com clamp no agora), término fixado, e `durationMin` calculado por `businessMinutesBetween(start, end)`.
- Os cards seguintes continuam partindo do término desse card (cursor nunca retrocede), então a cascata automática se mantém.
- Selo do card passa a mostrar "início e término ajustados" quando ambos foram fixados.

## Detalhes técnicos

- `ReorderManualOverride`: já possui `startISO/startTime/endISO/endTime/durationMin`; a mudança é permitir a combinação start+end em vez de tratá-las como exclusivas.
- No modal, o estado `draft` reutiliza `endDate/endTime` também no ramo não-`keepStart`, e ganha `pin: "duration" | "end"` para saber qual dos dois o usuário fixou por último.
- Rótulo da duração exibe o valor calculado em cinza quando derivada.

## Validação

- Card 2 do exemplo (início 30/07 17:05): mudar término para 31/07 09:00 recalcula a duração para o tempo útil correspondente e empurra o card 3 a partir de 09:00 de 31/07.
- Digitar duração manual continua funcionando e recalcula o término.
- Card 1 (em execução) mantém o comportamento atual: só término editável.
