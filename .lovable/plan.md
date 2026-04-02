

## Plano: Tornar contas editáveis + novos campos (valor, forma de pagamento, recibo)

### 1. Migração de banco de dados
Adicionar 2 novas colunas à tabela `bills_payable`:
- `amount` (numeric, nullable, default null) — valor da conta
- `payment_method` (text, nullable) — forma de pagamento

### 2. Refatorar `NewBillModal` → `BillFormModal`
Transformar o modal existente para suportar criação e edição:
- Aceitar prop opcional `bill` com dados existentes para edição
- Quando `bill` é passado, preencher formulário e usar `UPDATE` ao invés de `INSERT`
- Título dinâmico: "Nova Conta a Pagar" vs "Editar Conta"
- Novos campos no formulário:
  - **Valor** — input numérico com placeholder "R$ 0,00"
  - **Forma de Pagamento** — select com opções: Pix, Boleto, Cartão de Crédito, Cartão de Débito, Transferência, Dinheiro
  - **Recibo de Pagamento** — botão de upload separado do anexo principal, usando os campos `attachment_url` e `attachment_name` já existentes para o anexo original, e um segundo upload para recibo que será salvo no mesmo bucket `bill-attachments` porém em campos separados no formulário (exibido como segundo anexo no mesmo modal)
- Mostrar anexo existente com opção de substituir

### 3. Atualizar `BillsList`
- Tornar cada linha da tabela clicável → abrir `BillFormModal` em modo edição
- Adicionar colunas "Valor" e "Forma Pgto" na tabela
- Atualizar interface `Bill` com os novos campos

### 4. Atualizar `Financial.tsx`
- Atualizar import do modal renomeado

### Arquivos modificados
- **Migração SQL** — adicionar colunas `amount`, `payment_method`
- **`src/components/NewBillModal.tsx`** → renomear para `BillFormModal`, adicionar modo edição + novos campos
- **`src/pages/BillsList.tsx`** — linhas clicáveis, novas colunas, modal de edição
- **`src/pages/Financial.tsx`** — atualizar import
- **`src/pages/BillsDueByDate.tsx`** — atualizar interface e exibição das novas colunas

