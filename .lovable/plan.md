

## Correção do BlockEditor -- Performance e Estabilidade

### Problemas identificados

1. **Extensoes duplicadas** -- Console alerta "Duplicate extension names: ['link', 'underline']". O StarterKit ja inclui algumas extensoes base, e ao registrar Link/Underline separadamente sem desabilitar no StarterKit, o TipTap entra em conflito. Isso quebra o BubbleMenu e causa comportamento erratico.

2. **Loop de re-render (lentidao)** -- A cada tecla, `onUpdate` chama `onChange(editor.getHTML())`, que atualiza o state do TaskCard, que passa `content` de volta ao BlockEditor, que no `useEffect` compara `content !== editor.getHTML()` e pode chamar `setContent` novamente. Isso gera re-renders cascata e torna a digitacao lenta.

3. **CSS de drag handle conflitante** -- O estilo `.ProseMirror li::before { content: '⠿' }` aplica uma alca de drag em TODOS os `li`, incluindo itens de taskList. Conflita com `taskList li::before { display: none }` em niveis aninhados.

4. **Checkbox sem area de clique adequada** -- O input checkbox tem apenas 1rem de tamanho sem padding de clique, dificultando o uso em mobile e desktop.

### Solucao

**Arquivo: `src/components/BlockEditor.tsx`**

1. **Resolver extensoes duplicadas**: Desabilitar no StarterKit as extensoes que sao registradas separadamente. Adicionar `strike: false` e `dropcursor: false` (ja feito) e `gapcursor: false` (ja feito). O `Link` e `Underline` NAO vem no StarterKit, entao o warning vem de outro lugar -- verificar se ha importacao duplicada ou se o `@tiptap/starter-kit` da versao instalada inclui esses modulos. Solucao: adicionar verificacao explicita e garantir registro unico.

2. **Corrigir loop de re-render com debounce**:
   - Adicionar `useRef` para armazenar o ultimo HTML emitido
   - No `onUpdate`, comparar com o ref antes de chamar `onChange`
   - No `useEffect` de sincronizacao externa, comparar com `editor.getHTML()` usando o ref para evitar loop
   - Adicionar debounce de ~300ms no `onUpdate` para nao disparar onChange a cada keystroke

3. **Remover re-criacao desnecessaria de conteudo**: O `useEffect` que faz `editor.commands.setContent(content)` so deve executar quando o content muda de fora (ex: reset do form), nao quando muda internamente. Usar o ref de "ultimo HTML emitido" para distinguir.

**Arquivo: `src/index.css`**

4. **Corrigir CSS do drag handle**: Restringir o seletor `li::before` para NAO aplicar em taskList items. Mudar de `.ProseMirror li::before` para `.ProseMirror > ul:not([data-type="taskList"]) li::before, .ProseMirror > ol li::before` ou similar, evitando conflito.

5. **Melhorar area de clique do checkbox**:
   - Aumentar area de toque do label para min 24x24px
   - Adicionar `cursor-pointer` no label e no checkbox
   - Melhorar feedback visual: transicao suave no check, cor de fundo ao marcar

### Detalhes tecnicos

**Debounce no onUpdate (BlockEditor.tsx):**
```
const lastEmittedHtml = useRef(content || '');
const debounceTimer = useRef<NodeJS.Timeout>();

// No useEditor:
onUpdate: ({ editor }) => {
  const html = editor.getHTML();
  if (html === lastEmittedHtml.current) return;
  clearTimeout(debounceTimer.current);
  debounceTimer.current = setTimeout(() => {
    lastEmittedHtml.current = html;
    onChange(html);
  }, 300);
},

// No useEffect de sync:
useEffect(() => {
  if (editor && content !== lastEmittedHtml.current) {
    lastEmittedHtml.current = content || '';
    editor.commands.setContent(content || '');
  }
}, [content, editor]);
```

**Resolucao de extensoes duplicadas:**
- Investigar se a versao do `@tiptap/starter-kit` (3.10.7) inclui Link ou Underline por padrao
- Se sim: remover do StarterKit com `link: false, underline: false`
- Se nao: verificar se ha dupla importacao/mount do componente BlockEditor

**CSS corrigido para drag handles (index.css):**
- Mudar seletor de `.ProseMirror li::before` para excluir explicitamente `[data-type="taskList"] li`
- Alternativa: usar `.ProseMirror > ul:not([data-type]) > li::before, .ProseMirror > ol > li::before` para aplicar apenas em listas normais de primeiro nivel

**CSS melhorado para checkboxes (index.css):**
- Label: `min-height: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer;`
- Checkbox: `appearance: none; width: 18px; height: 18px; border: 2px solid; border-radius: 4px; transition: all 0.15s;`
- Checkbox checked: `background-color: hsl(var(--primary)); border-color: hsl(var(--primary)); background-image: url(checkmark-svg);`

### Impacto

- Nenhuma alteracao de banco de dados
- Nenhuma alteracao de props do BlockEditor (API identica)
- Resolve o warning de extensoes duplicadas
- Resolve a lentidao ao digitar (debounce + eliminacao de loop)
- Resolve o BubbleMenu que nao aparece
- Melhora significativamente a usabilidade das checkboxes
- Compativel com todo o HTML existente

