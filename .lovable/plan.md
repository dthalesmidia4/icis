# Financeiro — destravar a digitação no modal do lançamento

## O que está acontecendo (verificado no banco e no código)

O lançamento que você abriu é o **Adobe Creative Cloud (competência ago/2026)**. No banco ele está num estado híbrido:

- item é **Cartão de Crédito** (Itaú ••••7587);
- a ocorrência tem `paid_at` próprio (24/08), **sem `charge_date`** e com `due_date` antigo (14/07);
- os snapshots do mês estão preenchidos (`Cartão de Crédito` + id do cartão).

Consequências no modal atual:

1. Como o fato está "fechado" (`paid_at`), o modal abre em **consulta** e todos os campos ficam somente leitura — sem nenhuma explicação na tela do porquê.
2. A única saída é o botão `Corrigir lançamento`, que está escondido no **rodapé**, depois de rolar o modal. Nada no topo diz que é preciso clicar nele para poder digitar.
3. O aviso de "pagamento direto registrado antes do vínculo ao cartão" (que ofereceria converter em cobrança do cartão) **não aparece** porque o detector exige snapshots nulos — e nesta linha eles existem. Ou seja: o caso real ficou sem a ação que foi feita justamente para ele.

## O que vou implementar

1. **Explicar o bloqueio no topo, junto dos campos.** Um aviso no início de "Dados deste mês" dizendo que o lançamento está fechado e trazendo o botão `Corrigir lançamento` ali mesmo (o do rodapé continua). Ao clicar, os campos factuais abrem e o foco vai para o valor.
2. **Campos em consulta passam a se identificar.** Estilo e `aria-readonly` consistentes, para não parecer que o campo está quebrado.
3. **Corrigir o detector de transição incoerente.** Passar a reconhecer também o caso com snapshots de cartão preenchidos: item em cartão + ocorrência com `paid_at` próprio + `charge_date` ausente. Assim o Adobe passa a exibir o bloco "Converter em cobrança do cartão" (você informa a data real da cobrança; nada é inventado).
4. **Ligar a correção monetária de componente de fatura fechada.** A regra pura `financeClosedCorrection` existe mas hoje não é usada por nenhuma tela: vou conectá-la para que um item que compõe uma fatura já paga permita corrigir valor/câmbio sem tocar em datas, pagamento ou vínculo da fatura.

## O que NÃO muda (regras financeiras preservadas)

- Correção continua explícita e passando pelas RPCs seguras com trilha em `finance_occurrence_corrections`.
- `paid_at` / `paid_amount_brl` seguem intocáveis pela correção; fatura (`kind=card`) paga continua bloqueada.
- Nenhum dado será corrigido por mim no banco — Adobe e Laser Jet ficam para você ajustar pela tela.
- Compra no cartão continua sem vencimento próprio; a data do fato do cartão continua sendo `charge_date`.

## Detalhes técnicos

- `src/components/finance/FinanceOccurrenceModal.tsx`: banner de estado fechado + botão de correção no topo, autofoco ao entrar em correção, estilo de campo em consulta, uso de `closedFactMode`.
- `src/lib/financeFactCorrection.ts`: ampliar `isLegacyDirectPaymentOnCard` para o caso com snapshot de cartão (mantendo a exigência de `paid_at` próprio + `charge_date` nulo).
- `src/lib/financeFactCorrection.test.ts` e `financeClosedCorrection.test.ts`: novos casos cobrindo o estado real do Adobe e a permissividade seletiva; suíte completa rodada ao final.
- Sem migration nova: as RPCs `finance_correct_occurrence` e `finance_convert_occurrence_to_card_charge` já existem.
