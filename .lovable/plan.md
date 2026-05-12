## Objetivo

Reverter o autosave. As cores e fontes só devem ser persistidas em `tenant_companies` quando o usuário clicar em **Salvar Predefinição**. Ao reabrir o modal, os campos devem refletir o que foi efetivamente salvo (e não voltar para `000000` por falta de leitura das colunas certas).

## Causa do bug visual

- `fetchCompanyData` não lia `brand_highlight_color` nem `brand_text_color`, então sempre voltavam para os defaults.
- `handleSaveVisual` salvava só `brand_primary/secondary/auxiliary` em `tenant_companies` — destaque e texto só iam para `visual_identity_presets`.
- Resultado: mesmo clicando em "Salvar Predefinição", destaque/texto não persistiam na empresa e sumiam ao reabrir.

## Mudanças (`src/components/VisualIdentityModal.tsx`)

1. **Remover o `useEffect` de autosave debounced** adicionado no último turno (o bloco que faz `supabase.from('tenant_companies').update(...)` a cada mudança de cor/fonte).
2. **Remover** `hasLoadedCompanyRef` e seu uso (não é mais necessário).
3. **Manter** o `fetchCompanyData` lendo também `brand_highlight_color` e `brand_text_color`, populando `setHighlightColor` / `setTextColor` (corrige o "tudo 000000" ao reabrir, lendo o que foi salvo).
4. **Atualizar `handleSaveVisual`** para gravar em `tenant_companies` também `brand_highlight_color` e `brand_text_color`, além dos campos já existentes — assim a predefinição salva é o que aparece ao reabrir.

## Comportamento final

- Digitar/escolher cores e fontes só altera o estado local; nada vai ao banco.
- Clicar em **Salvar Predefinição** com nome preenchido: grava todos os campos de marca em `tenant_companies` e cria a entrada em `visual_identity_presets`.
- Ao fechar e reabrir o modal: campos refletem exatamente o último "Salvar Predefinição" (ou os defaults se nunca houve um salvamento).

## Fora de escopo

- Migração do banco: as colunas `brand_highlight_color` e `brand_text_color` já foram criadas na migração anterior; mantemos.
- Estrutura de presets, mascote e logo: inalteradas.
