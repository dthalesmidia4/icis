

# Correção da Vulnerabilidade do jsPDF

## Problema

O pacote `jspdf` v3.0.4 tem uma vulnerabilidade crítica de **Local File Inclusion / Path Traversal** (GHSA-f8cm-6447-x5h2). Não existe versão corrigida disponível do jsPDF para esta vulnerabilidade.

## Uso Atual

O `jspdf` é usado **apenas** em `src/pages/GenerateQuestions.tsx` para exportar a anamnese como PDF. O uso é simples: gerar texto em páginas e salvar como `.pdf`.

## Solução Proposta

Substituir `jspdf` por **geração de PDF via `window.print()`** com CSS `@media print`, eliminando a dependência vulnerável:

1. **Remover `jspdf`** do `package.json`
2. **Reescrever `handleExportPDF`** para criar uma janela temporária com o conteúdo formatado em HTML/CSS e chamar `window.print()`, que permite salvar como PDF nativamente no navegador
3. **Atualizar o scan de segurança** marcando o finding como corrigido

## Vantagens

- Elimina completamente a dependência vulnerável
- O resultado visual do PDF fica melhor (suporte a UTF-8, formatação rica)
- Zero dependências externas

## Desvantagens

- O usuário precisa escolher "Salvar como PDF" no diálogo de impressão (comportamento padrão dos navegadores modernos)

## Alternativa

Se preferir manter geração programática sem diálogo de impressão, posso substituir por `pdf-lib` (sem vulnerabilidades conhecidas), porém com mais código para formatar texto.

## Arquivos Alterados

| Arquivo | Alteração |
|---------|-----------|
| `package.json` | Remover `jspdf` |
| `src/pages/GenerateQuestions.tsx` | Substituir import e `handleExportPDF` por versão com `window.print()` |

