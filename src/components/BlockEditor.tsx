import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Bold, Italic, Heading1, Heading2, Heading3, 
  List, ListOrdered, Minus, Type, Quote, Code, CheckSquare, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlockEditorProps {
  content: string;
  onChange: (content: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

interface SlashMenuItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: () => void;
}

export function BlockEditor({ 
  content, 
  onChange, 
  onBlur,
  placeholder = "Digite '/' para comandos...",
  className,
  minHeight = "120px"
}: BlockEditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc ml-4 space-y-1',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal ml-4 space-y-1',
          },
        },
        horizontalRule: {
          HTMLAttributes: {
            class: 'my-4 border-t border-border',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-3',
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-muted rounded-lg p-4 font-mono text-sm my-3 overflow-x-auto',
          },
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'not-prose space-y-2 my-3',
        },
      }),
      TaskItem.configure({
        HTMLAttributes: {
          class: 'flex items-start gap-2',
        },
        nested: true,
      }),
      Details.configure({
        HTMLAttributes: {
          class: 'border border-border rounded-lg my-3 overflow-hidden',
        },
      }),
      DetailsSummary.configure({
        HTMLAttributes: {
          class: 'px-3 py-2 bg-muted/40 font-medium cursor-pointer hover:bg-muted/60 transition-colors',
        },
      }),
      DetailsContent.configure({
        HTMLAttributes: {
          class: 'px-3 py-2',
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'Título...';
          }
          return placeholder;
        },
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none',
          'prose-headings:font-semibold prose-headings:text-foreground',
          'prose-h1:text-2xl prose-h1:mb-3 prose-h1:mt-4',
          'prose-h2:text-xl prose-h2:mb-2 prose-h2:mt-3',
          'prose-h3:text-lg prose-h3:mb-2 prose-h3:mt-3',
          'prose-p:text-foreground prose-p:mb-2 prose-p:leading-relaxed',
          'prose-ul:my-2 prose-ol:my-2',
          'prose-li:text-foreground prose-li:my-0.5',
          'prose-strong:font-semibold prose-strong:text-foreground',
          'prose-em:italic',
          'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono',
          'prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:pl-4 prose-blockquote:italic',
          '[&_.is-editor-empty:first-child::before]:text-muted-foreground/70',
          '[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.is-editor-empty:first-child::before]:float-left',
          '[&_.is-editor-empty:first-child::before]:h-0',
          '[&_.is-editor-empty:first-child::before]:pointer-events-none',
          // TaskList styles
          '[&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:pl-0',
          '[&_ul[data-type="taskList"]_li]:flex [&_ul[data-type="taskList"]_li]:items-start [&_ul[data-type="taskList"]_li]:gap-2',
          '[&_ul[data-type="taskList"]_li_label]:flex [&_ul[data-type="taskList"]_li_label]:items-center',
          '[&_ul[data-type="taskList"]_li_label_input]:w-4 [&_ul[data-type="taskList"]_li_label_input]:h-4',
          '[&_ul[data-type="taskList"]_li_label_input]:accent-primary',
          '[&_ul[data-type="taskList"]_li_div]:flex-1',
          '[&_ul[data-type="taskList"]_li[data-checked="true"]_div]:line-through [&_ul[data-type="taskList"]_li[data-checked="true"]_div]:text-muted-foreground',
          // Details/Toggle styles
          '[&_details]:border [&_details]:border-border [&_details]:rounded-lg [&_details]:my-3 [&_details]:overflow-hidden',
          '[&_details_summary]:px-3 [&_details_summary]:py-2 [&_details_summary]:bg-muted/40 [&_details_summary]:font-medium [&_details_summary]:cursor-pointer [&_details_summary]:hover:bg-muted/60 [&_details_summary]:transition-colors',
          '[&_details_div[data-type="detailsContent"]]:px-3 [&_details_div[data-type="detailsContent"]]:py-2',
        ),
      },
      handleKeyDown: (view, event) => {
        // Handle slash command
        if (event.key === '/' && !showSlashMenu) {
          const { selection } = view.state;
          const { $from } = selection;
          
          // Only show menu at the start of a line or after whitespace
          const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
          if (textBefore === '' || textBefore.endsWith(' ')) {
            setTimeout(() => {
              const coords = view.coordsAtPos(selection.from);
              const editorRect = editorRef.current?.getBoundingClientRect();
              if (editorRect) {
                setSlashMenuPosition({
                  top: coords.top - editorRect.top + 24,
                  left: coords.left - editorRect.left,
                });
              }
              setShowSlashMenu(true);
              setSelectedIndex(0);
              setFilterText('');
            }, 0);
          }
        }

        // Handle menu navigation
        if (showSlashMenu) {
          if (event.key === 'Escape') {
            setShowSlashMenu(false);
            return true;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
            return true;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (filteredItems[selectedIndex]) {
              executeCommand(selectedIndex);
            }
            return true;
          }
          // Filter by typing
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            setFilterText(prev => prev + event.key);
          }
          if (event.key === 'Backspace') {
            if (filterText.length > 0) {
              setFilterText(prev => prev.slice(0, -1));
            } else {
              setShowSlashMenu(false);
            }
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        // Text is selected, show toolbar
        const coords = editor.view.coordsAtPos(from);
        const editorRect = editorRef.current?.getBoundingClientRect();
        if (editorRect) {
          setToolbarPosition({
            top: coords.top - editorRect.top - 40,
            left: Math.max(0, coords.left - editorRect.left),
          });
          setShowToolbar(true);
        }
      } else {
        setShowToolbar(false);
      }
    },
    onBlur: () => {
      // Delay closing to allow click on menu items
      setTimeout(() => {
        setShowSlashMenu(false);
        setShowToolbar(false);
      }, 200);
      // Call the onBlur prop for auto-save
      onBlur?.();
    },
  });

  const slashMenuItems: SlashMenuItem[] = editor ? [
    {
      title: 'Texto',
      description: 'Parágrafo comum',
      icon: <Type className="h-4 w-4" />,
      command: () => editor.chain().focus().setParagraph().run(),
    },
    {
      title: 'Título 1',
      description: 'Título grande',
      icon: <Heading1 className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: 'Título 2',
      description: 'Título médio',
      icon: <Heading2 className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: 'Título 3',
      description: 'Título pequeno',
      icon: <Heading3 className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: 'Lista',
      description: 'Lista com marcadores',
      icon: <List className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: 'Lista Numerada',
      description: 'Lista ordenada',
      icon: <ListOrdered className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: 'Checklist',
      description: 'Lista de tarefas',
      icon: <CheckSquare className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      title: 'Toggle',
      description: 'Bloco colapsável',
      icon: <ChevronRight className="h-4 w-4" />,
      command: () => editor.chain().focus().setDetails().run(),
    },
    {
      title: 'Citação',
      description: 'Bloco de citação',
      icon: <Quote className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: 'Código',
      description: 'Bloco de código',
      icon: <Code className="h-4 w-4" />,
      command: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      title: 'Divisor',
      description: 'Linha horizontal',
      icon: <Minus className="h-4 w-4" />,
      command: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ] : [];

  const filteredItems = slashMenuItems.filter(item =>
    item.title.toLowerCase().includes(filterText.toLowerCase()) ||
    item.description.toLowerCase().includes(filterText.toLowerCase())
  );

  const executeCommand = useCallback((index: number) => {
    const item = filteredItems[index];
    if (item && editor) {
      // Remove the slash and filter text
      const { selection } = editor.state;
      const from = selection.from - filterText.length - 1;
      editor.chain().focus().deleteRange({ from, to: selection.from }).run();
      item.command();
      setShowSlashMenu(false);
      setFilterText('');
    }
  }, [editor, filteredItems, filterText]);

  // Update content when prop changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  if (!editor) {
    return null;
  }

  return (
    <div 
      ref={editorRef}
      className={cn(
        "relative rounded-lg border border-border bg-background transition-colors",
        "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20",
        className
      )}
    >
      {/* Fixed Quick Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-muted/30">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(
            "p-1.5 rounded hover:bg-muted transition-colors",
            editor.isActive('bulletList') && "bg-muted text-primary"
          )}
          type="button"
          title="Lista com marcadores"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(
            "p-1.5 rounded hover:bg-muted transition-colors",
            editor.isActive('orderedList') && "bg-muted text-primary"
          )}
          type="button"
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={cn(
            "p-1.5 rounded hover:bg-muted transition-colors",
            editor.isActive('taskList') && "bg-muted text-primary"
          )}
          type="button"
          title="Checklist"
        >
          <CheckSquare className="h-4 w-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().setDetails().run()}
          className={cn(
            "p-1.5 rounded hover:bg-muted transition-colors",
            editor.isActive('details') && "bg-muted text-primary"
          )}
          type="button"
          title="Toggle (colapsável)"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            "p-1.5 rounded hover:bg-muted transition-colors",
            editor.isActive('bold') && "bg-muted text-primary"
          )}
          type="button"
          title="Negrito"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(
            "p-1.5 rounded hover:bg-muted transition-colors",
            editor.isActive('italic') && "bg-muted text-primary"
          )}
          type="button"
          title="Itálico"
        >
          <Italic className="h-4 w-4" />
        </button>
      </div>

      {/* Floating Toolbar for text formatting */}
      {showToolbar && (
        <div
          className="absolute z-50 flex items-center gap-0.5 p-1 bg-popover border border-border rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
          style={{
            top: Math.max(0, toolbarPosition.top),
            left: toolbarPosition.left,
          }}
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('bold') && "bg-muted text-primary"
            )}
            type="button"
            title="Negrito (Ctrl+B)"
            aria-label="Negrito"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('italic') && "bg-muted text-primary"
            )}
            type="button"
            title="Itálico (Ctrl+I)"
            aria-label="Itálico"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('code') && "bg-muted text-primary"
            )}
            type="button"
            title="Código inline"
            aria-label="Código inline"
          >
            <Code className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('heading', { level: 1 }) && "bg-muted text-primary"
            )}
            type="button"
            title="Título 1"
            aria-label="Título 1"
          >
            <Heading1 className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('heading', { level: 2 }) && "bg-muted text-primary"
            )}
            type="button"
            title="Título 2"
            aria-label="Título 2"
          >
            <Heading2 className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('bulletList') && "bg-muted text-primary"
            )}
            type="button"
            title="Lista"
            aria-label="Lista com marcadores"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('blockquote') && "bg-muted text-primary"
            )}
            type="button"
            title="Citação"
            aria-label="Citação"
          >
            <Quote className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Editor Content */}
      <EditorContent 
        editor={editor} 
        className="p-4"
        style={{ minHeight }}
      />

      {/* Slash Command Menu */}
      {showSlashMenu && filteredItems.length > 0 && (
        <div
          className="absolute z-50 w-64 bg-popover border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-150"
          style={{
            top: slashMenuPosition.top,
            left: Math.min(slashMenuPosition.left, 200),
          }}
        >
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Type className="h-3 w-3" />
              <span>Adicionar bloco</span>
              {filterText && (
                <span className="ml-auto text-primary">"{filterText}"</span>
              )}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredItems.map((item, index) => (
              <button
                key={item.title}
                onClick={() => executeCommand(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                  index === selectedIndex 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-muted"
                )}
                type="button"
              >
                <div className={cn(
                  "p-1.5 rounded bg-muted",
                  index === selectedIndex && "bg-primary/20"
                )}>
                  {item.icon}
                </div>
                <div>
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-border bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>↑↓ navegar</span>
              <span>•</span>
              <span>Enter selecionar</span>
              <span>•</span>
              <span>Esc fechar</span>
            </div>
          </div>
        </div>
      )}

      {/* Helper text */}
      <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/80 pointer-events-none">
        / comandos • Ctrl+B negrito • Ctrl+I itálico
      </div>
    </div>
  );
}
