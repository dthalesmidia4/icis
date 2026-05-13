# Correção: campos de Localização e contatos não persistem

## Causa raiz

A tabela `tenant_companies` no banco **não possui colunas** para os campos exibidos no formulário:
- Localização: `cep`, `street`, `number`, `city`, `state`, `complement`
- Contato: `corporate_email`, `commercial_phone`, `cpf` (CPF do responsável)

Por isso:
- Em `CompanyRegistration.tsx` (linha 194-216), o cadastro monta um `fullAddress` mas **não envia para o banco** (variável é descartada). Os campos `corporate_email`, `commercial_phone` e `cpf` também são ignorados no `insert`.
- Em `ClientDetails.tsx`, `parseStoredData` (linhas 113-122) define todos esses campos como string vazia ao carregar — então a UI sempre mostra "Não informado". O `handleSave` (linhas 485-499) também não envia esses campos no `update`.

Logo, os dados nunca chegam ao banco e nunca são lidos. O preview do usuário reflete fielmente o estado real.

## Plano

### 1. Migration: adicionar colunas em `tenant_companies`
Adicionar (todos `text NULL`):
- `cep`, `street`, `number`, `city`, `state`, `complement`
- `corporate_email`, `commercial_phone`, `responsible_cpf`

### 2. `src/pages/CompanyRegistration.tsx`
No `insert` (linha 204), incluir os 9 novos campos a partir de `formData` (sanitizados, `null` quando vazios). Remover a montagem descartada de `fullAddress`.

### 3. `src/pages/ClientDetails.tsx`
- `parseStoredData`: preencher `cep/street/number/city/state/complement/corporate_email/commercial_phone/cpf` a partir das novas colunas do `client`.
- `handleSave`: enviar os mesmos 9 campos no `update` (com `.trim() || null`).

### 4. Regenerar tipos
A migration aciona regeneração automática de `src/integrations/supabase/types.ts`.

## Sem mudanças
- Layout/visual da página (a tela já tem todos os inputs).
- Outras páginas (Kanban, Hub, etc.) não dependem desses campos.
- Bucket de logos, mascote, identidade visual — fora do escopo.

## Detalhes técnicos
- Os campos são opcionais (não obrigatórios na validação atual de `ClientDetails`); permanecem opcionais.
- ViaCEP autofill já funciona localmente; passa a persistir.
- `responsible_cpf` separado de `cnpj_cpf` (que continua sendo o documento principal da empresa).
