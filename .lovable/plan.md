# Correção definitiva do início do primeiro card em andamento

## Objetivo

Garantir que a reorganização automática nunca reescreva o início histórico do primeiro card que já está em execução, tanto quando o término ainda está no futuro quanto quando está vencido, sem comprometer a extensão do término nem o encadeamento dos cards seguintes.

## Implementação

1. **Unificar a identificação do início protegido no motor**
   - Em `src/lib/reorderSequence.ts`, definir a preservação do início a partir de `inProgressFirst`, independentemente de `treatAsStuck`, `stagePlanned` ou da comparação entre tempo planejado e duração configurada.
   - Manter a precedência dos ajustes manuais explícitos: um início manual continua seguindo o fluxo de ajuste manual; um término manual pode alterar somente o término do card em execução.

2. **Separar o horário histórico do intervalo de alocação**
   - Manter `origStart` como `startISO/startTime` da proposta para o primeiro card em execução.
   - Calcular e conservar separadamente o início efetivo de ocupação futura (`allocStart`), usando “agora”/cursor até o término recalculado.
   - Usar exclusivamente `allocStart → end` nos bloqueios e `end + 5 min` no cursor, evitando que o início antigo volte a bloquear a agenda.

3. **Preservar a regra de atraso e o feedback do modal**
   - No ramo vencido, continuar aplicando a extensão/folga existente ao término, inclusive no caso limítrofe `stagePlanned === baseDur`, mas sem permitir que essa decisão altere o início.
   - Manter `keepStart` verdadeiro para o card em execução, de modo que o modal apresente o selo “em execução”, o início original e somente a eventual mudança de término.
   - Revisar o cálculo de `changed`: ele poderá permanecer verdadeiro quando o término mudar, mas a proposta conservará exatamente os valores originais de `due_date/due_time`.

4. **Evitar a regravação desnecessária do início ao aplicar**
   - Ajustar a aplicação em `src/components/kanban/ReorderSequenceModal.tsx` para montar o `UPDATE` por campo alterado.
   - Para uma proposta com início preservado, enviar apenas `delivery_date/delivery_time` (e os metadados já aplicáveis), nunca `due_date/due_time`; os demais cards continuam atualizando os quatro campos quando necessário.

5. **Adicionar cobertura automatizada de regressão**
   - Como o projeto ainda não possui infraestrutura de testes, adicionar a configuração mínima do Vitest e um teste focado no motor.
   - Cobrir: término futuro; término vencido com `stagePlanned > baseDur`; término vencido com `stagePlanned === baseDur`; ajuste manual de término; preservação literal de `due_date/due_time`; e encadeamento do card seguinte após o novo término sem colisão.
   - Executar o teste focado e a verificação TypeScript do projeto.

## Arquivos previstos

- `src/lib/reorderSequence.ts`
- `src/components/kanban/ReorderSequenceModal.tsx`
- `src/lib/reorderSequence.test.ts`
- `package.json` e configuração de teste, somente no mínimo necessário para executar a regressão

## Sem alteração de banco

A correção é integralmente no motor, na aplicação seletiva da proposta e na cobertura de testes; nenhuma migration ou mudança de dados será necessária.