# Hub do Cliente: cores da marca, header e edição de exigências

## 1. Cores do cliente não aparecem (causa confirmada)

O hub já aplica o tema via `buildClientBrandStyle(selectedClient)`, mas o objeto de cliente guardado na sessão é montado à mão nas telas de seleção (`Home.tsx`, `ClientList.tsx`, `GuideClientList.tsx`, `CronogramaGlobal.tsx`) com apenas `id, name, fantasy_name, cnpj_cpf, email` — as cores nunca chegam ao hub, então o tema padrão azul permanece.

Confirmado no banco: Paulo Bianchini tem `brand_primary_color = #F37021`, mas a tela renderiza azul.

Correção: o hub deixa de depender do objeto da sessão para cores e busca as cores da marca do próprio cliente (`brand_primary_color`, `brand_secondary_color`, `brand_highlight_color`, `brand_text_color`) ao carregar, aplicando `buildClientBrandStyle` no container do hub. Sem cores cadastradas, mantém o tema padrão.

## 2. Botão voltar

Remover a seta de voltar do conteúdo do hub (topbar do header), já que a navegação de retorno existe no breadcrumb do topo da aplicação. O restante da topbar (monograma, nome, período, Cadastro, Ações) fica igual.

## 3. Cuidados fundamentais: edição sob demanda

- Por padrão, exibir só a lista numerada de exigências, com um link/botão discreto "Editar exigências".
- Ao clicar, aparece o textarea com "Salvar exigências" e "Cancelar"; salvar ou cancelar volta ao modo de leitura (cancelar descarta as alterações).

## Detalhes técnicos

- `src/pages/ClientHub.tsx`: consulta das cores da marca do cliente selecionado e aplicação do estilo no container; remoção da prop de voltar.
- `src/components/client-hub/ClientHubHeader.tsx`: remover `BackButton`/`backTo`.
- `src/components/client-hub/GuidelinesTab.tsx`: estado local de edição (leitura x edição), sem mudança na persistência atual.
- Nenhuma alteração de dados, permissões ou lógica de negócio.
