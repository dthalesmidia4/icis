# Correção: Bairro + persistência visual de campos

## Diagnóstico

1. **Localização não exibe após salvar** — para os campos `cep/street/city/state/complement/number`, o modo de leitura **mostra `formData.X`** corretamente, mas os campos `commercial_phone`, `corporate_email` e `cpf do responsável` no modo leitura têm **"Não informado" hard-coded** (linhas ~807, ~1077, ~1158 de `ClientDetails.tsx`). Mesmo salvos no banco, nunca aparecem.
2. **Bairro não existe** — não há coluna `neighborhood` no DB nem campo no formulário, e a chamada do ViaCEP não captura `data.bairro`.
3. O PATCH no banco já persiste os 9 campos novos (verificado via logs: `204 No Content`). A regravação do banco está correta.

## Plano

### 1. Migration
Adicionar `neighborhood text` em `tenant_companies`.

### 2. `src/pages/ClientDetails.tsx`
- `ClientFormData`: adicionar `neighborhood: string`.
- `parseStoredData`: ler `client.neighborhood`.
- Estado inicial e `handleCancel`: incluir `neighborhood: ""`.
- `handleSave`: enviar `neighborhood: formData.neighborhood.trim() || null`.
- `fetchAddressByCep`: setar `neighborhood: data.bairro || ""` junto com street/city/state.
- UI Localização: adicionar campo **Bairro** entre Endereço e Número (grid passa a ter Cidade/Estado/Bairro/Complemento bem distribuídos — ajustar grid para 4 colunas na linha de cidade/estado/bairro/complemento, ou reorganizar em 2 grids 3-col).
- Modos leitura de `commercial_phone`, `corporate_email`, `cpf`: substituir "Não informado" hard-coded por `formData.commercial_phone || "Não informado"` etc., para refletir o que está salvo.

### 3. `src/pages/CompanyRegistration.tsx`
- `formData`: adicionar `neighborhood: ""`.
- `fetchAddressByCep`: setar `neighborhood: data.bairro || ""`.
- `insert`: enviar `neighborhood`.
- UI Localização: adicionar input **Bairro** (mesma linha que Cidade/Estado, ou linha própria).

### 4. Confirmação ao usuário
Após esta atualização, o usuário deve preencher novamente o cliente em modo de Edição — o teste anterior salvou com bundle antigo (antes do reload do Vite), por isso os valores ficaram vazios no banco; agora a UI também exibirá corretamente após salvar.

## Sem mudanças
- RLS, demais páginas, identidade visual, mascote.
