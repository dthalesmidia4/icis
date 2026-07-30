## Objetivo

Hoje uma demanda de Sistemas aponta para **um único** cliente final (`demands.subclient_id`). No caso real do card "Agente de Vacinas" a demanda foi solicitada por dois clientes (Belloti e Pontes Gestal) e isso hoje só cabe escrito no corpo do texto. Vamos permitir marcar **vários clientes solicitantes** na mesma demanda.

## Como vai funcionar

- O seletor "Cliente atendido" passa a ser **múltipla escolha** (checklist), com rótulo "Clientes solicitantes".
- O chip no cabeçalho do card mostra:
  - nenhum → "Sem cliente final"
  - um → nome do cliente
  - dois ou mais → "Belloti +1" (com todos os nomes no tooltip)
- O Customer Success · Sistemas passa a contar a demanda para **cada** cliente vinculado (uma demanda solicitada por 2 clientes conta como aberta/atrasada para os dois), o que corrige a leitura de saúde por cliente.
- Nada muda no fluxo de etapas, reorganização ou agendamento — o vínculo continua sendo apenas informativo/relatorial.

## Detalhes técnicos

1. **Migração**
   - `ALTER TABLE public.demands ADD COLUMN subclient_ids uuid[] NOT NULL DEFAULT '{}'`.
   - Backfill: `UPDATE public.demands SET subclient_ids = ARRAY[subclient_id] WHERE subclient_id IS NOT NULL`.
   - `subclient_id` é mantido como "cliente principal" (primeiro do array) para compatibilidade com o que já existe; a gravação sempre sincroniza os dois campos.
   - Índice GIN em `subclient_ids` para os filtros do CS.

2. **`src/components/SubclientSelect.tsx`**
   - Trocar `Select` por `Popover` + lista de `Checkbox` (mesmo padrão discreto já usado nos outros chips do cabeçalho), com props `value: string[]` e `onChange(ids: string[])`.
   - Continua invisível quando a empresa não tem clientes cadastrados.

3. **`src/components/TaskCard.tsx`**
   - Passar/gravar `subclient_ids` (e `subclient_id` = primeiro item) no update da demanda, mantendo o guard de rascunho já existente.

4. **`src/lib/clientHealth.ts`**
   - `loadSystemsClientHealth`: ler `subclient_ids` das demandas e casar por "contém o cliente", em vez de igualdade com `subclient_id`; fallback para `subclient_id` em linhas antigas.

5. **`src/lib/recordTouchpoint.ts` / Customer Success**
   - Sem mudança estrutural: o contato manual continua sendo por cliente (1 contato = 1 cliente).
