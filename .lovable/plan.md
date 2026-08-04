# Correção definitiva do início do primeiro card em andamento

## Diagnóstico confirmado

O card **“Adicionar opção de exclusão em eventos de diagnóstico e receita”**, do Eric, está salvo com início em **04/08/2026 15:15** e término em **04/08/2026 17:15**.

No motor atual, ele é reconhecido como o primeiro card em andamento, mas, como o término já passou, entra no caminho de card atrasado (`treatAsStuck`). Nesse caminho, o início histórico só é preservado quando o tempo planejado da etapa é maior que a duração configurada. Quando os tempos são iguais, como neste caso, `keepStart` permanece falso e o alocador substitui o início por um novo horário — exatamente o resultado exibido no modal.

## Correção

1. **Preservar invariavelmente o início histórico do primeiro card em andamento**
   - Se o primeiro card já começou, seu `due_date` e `due_time` não poderão ser alterados pela reorganização automática, esteja o término no futuro ou já atrasado.
   - Ajustes manuais explícitos continuam sendo respeitados.

2. **Separar histórico de execução e ocupação futura**
   - O início mostrado e persistido continuará sendo o início original.
   - Para organizar os próximos cards, o motor usará separadamente o intervalo ainda ocupado a partir de “agora” até o novo término, evitando que o início antigo bloqueie novamente toda a agenda.
   - Cards seguintes continuarão partindo do término recalculado do card em execução.

3. **Manter a extensão de atraso sem recomeçar o card**
   - O término poderá ser recalculado com a regra de duração/folga já existente.
   - Apenas o término será marcado como alterado; o modal exibirá o card como **em execução**, com o início histórico intacto.

4. **Adicionar proteção de regressão no próprio motor**
   - Cobrir os dois cenários que hoje seguem bifurcações diferentes: término futuro e término vencido.
   - Validar também o caso limítrofe confirmado, em que tempo planejado e duração configurada são iguais.
   - Confirmar que aplicar a proposta nunca envia um novo `due_date`/`due_time` para esse primeiro card e que os cards seguintes não colidem.

## Arquivos previstos

- `src/lib/reorderSequence.ts`: unificar a regra de preservação do início para todo primeiro card em andamento e separar o início histórico do início de alocação.
- Teste focado do motor de reordenação, seguindo a estrutura disponível no projeto, para impedir que essa falha recorrente volte.

Não será necessária alteração de banco de dados.