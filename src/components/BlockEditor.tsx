import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Dropcursor from '@tiptap/extension-dropcursor';
import Gapcursor from '@tiptap/extension-gapcursor';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, 
  List, ListOrdered, Minus, Type, Quote, Code, 
  CheckSquare, ChevronRight, GripVertical,
  Link as LinkIcon, Highlighter, Indent, Outdent,
  ExternalLink, X, Undo2, Redo2, Check, Loader2
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
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const editorRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const lastEmittedHtml = useRef(content || '');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: {
          HTMLAttributes: { class: 'list-disc ml-6 space-y-1' },
        },
        orderedList: {
          HTMLAttributes: { class: 'list-decimal ml-6 space-y-1' },
        },
        horizontalRule: {
          HTMLAttributes: { class: 'my-4 border-t border-border' },
        },
        blockquote: {
          HTMLAttributes: { class: 'border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-3' },
        },
        codeBlock: {
          HTMLAttributes: { class: 'bg-muted rounded-lg p-4 font-mono text-sm my-3 overflow-x-auto' },
        },
        dropcursor: false,
        gapcursor: false,
      }),
      Dropcursor.configure({ color: 'hsl(var(--primary))', width: 2 }),
      Gapcursor,
      TaskList.configure({
        HTMLAttributes: { class: 'not-prose task-list-root' },
      }),
      TaskItem.configure({
        HTMLAttributes: { class: 'task-item' },
        nested: true,
      }),
      Details.configure({
        HTMLAttributes: { class: 'border border-border rounded-lg my-3 overflow-hidden' },
      }),
      DetailsSummary.configure({
        HTMLAttributes: { class: 'px-3 py-2 bg-muted/40 font-medium cursor-pointer hover:bg-muted/60 transition-colors' },
      }),
      DetailsContent.configure({
        HTMLAttributes: { class: 'px-3 py-2' },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline decoration-primary/50 hover:decoration-primary cursor-pointer',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Título...';
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
          // Details/Toggle styles
          '[&_details]:border [&_details]:border-border [&_details]:rounded-lg [&_details]:my-3 [&_details]:overflow-hidden',
          '[&_details_summary]:px-3 [&_details_summary]:py-2 [&_details_summary]:bg-muted/40 [&_details_summary]:font-medium [&_details_summary]:cursor-pointer [&_details_summary]:hover:bg-muted/60 [&_details_summary]:transition-colors',
          '[&_details_div[data-type="detailsContent"]]:px-3 [&_details_div[data-type="detailsContent"]]:py-2',
        ),
      },
      handleKeyDown: (view, event) => {
        // Tab/Shift+Tab for task list nesting
        if (event.key === 'Tab' && editor) {
          const { state } = editor;
          const { $from } = state.selection;
          // Check if we're inside a taskItem or listItem
          const isInTaskItem = $from.parent.type.name === 'taskItem' || 
            state.selection.$from.node(-1)?.type.name === 'taskItem' ||
            state.selection.$from.node(-1)?.type.name === 'taskList';
          const isInListItem = $from.parent.type.name === 'listItem' ||
            state.selection.$from.node(-1)?.type.name === 'listItem';

          if (isInTaskItem || isInListItem) {
            event.preventDefault();
            if (event.shiftKey) {
              editor.chain().focus().liftListItem('taskItem').run() ||
              editor.chain().focus().liftListItem('listItem').run();
            } else {
              editor.chain().focus().sinkListItem('taskItem').run() ||
              editor.chain().focus().sinkListItem('listItem').run();
            }
            return true;
          }
        }

        // Ctrl+K for link
        if ((event.ctrlKey || event.metaKey) && event.key === 'k' && editor) {
          event.preventDefault();
          openLinkInput();
          return true;
        }

        // Handle slash command
        if (event.key === '/' && !showSlashMenu) {
          const { selection } = view.state;
          const { $from } = selection;
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
      const html = editor.getHTML();
      if (html === lastEmittedHtml.current) return;
      setSaveStatus('saving');
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        lastEmittedHtml.current = html;
        onChange(html);
        setSaveStatus('saved');
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 300);
    },
    onBlur: () => {
      setTimeout(() => {
        setShowSlashMenu(false);
      }, 200);
      onBlur?.();
    },
  });

  const openLinkInput = useCallback(() => {
    if (!editor) return;
    const existingHref = editor.getAttributes('link').href || '';
    setLinkUrl(existingHref);
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    if (linkUrl.trim() === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      let url = linkUrl.trim();
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor]);

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
      title: 'Link',
      description: 'Inserir link',
      icon: <LinkIcon className="h-4 w-4" />,
      command: () => openLinkInput(),
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
      const { selection } = editor.state;
      const from = selection.from - filterText.length - 1;
      editor.chain().focus().deleteRange({ from, to: selection.from }).run();
      item.command();
      setShowSlashMenu(false);
      setFilterText('');
    }
  }, [editor, filteredItems, filterText]);

  useEffect(() => {
    if (editor && content !== lastEmittedHtml.current) {
      lastEmittedHtml.current = content || '';
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
  }, [content, editor]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      clearTimeout(debounceTimer.current);
      clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  if (!editor) {
    return null;
  }

  const ToolbarButton = ({ onClick, isActive, title, children }: { onClick: () => void; isActive?: boolean; title: string; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={cn(
        "p-1.5 rounded hover:bg-muted transition-colors",
        isActive && "bg-muted text-primary"
      )}
      type="button"
      title={title}
    >
      {children}
    </button>
  );

  return (
    <div 
      ref={editorRef}
      className={cn(
        "relative rounded-lg border border-border bg-background transition-colors",
        "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20",
        className
      )}
    >
      {/* Fixed Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-muted/30 flex-wrap">
        {/* Undo/Redo */}
        <ToolbarButton 
          onClick={() => editor.chain().focus().undo().run()} 
          title="Desfazer (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton 
          onClick={() => editor.chain().focus().redo().run()} 
          title="Refazer (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />
        {/* Text formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrito (Ctrl+B)">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Itálico (Ctrl+I)">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Sublinhado (Ctrl+U)">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Destaque">
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={openLinkInput} isActive={editor.isActive('link')} title="Link (Ctrl+K)">
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Blocks */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Lista com marcadores">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Lista numerada">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} title="Checklist">
          <CheckSquare className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Indent/Outdent for checklists */}
        <ToolbarButton 
          onClick={() => {
            editor.chain().focus().sinkListItem('taskItem').run() ||
            editor.chain().focus().sinkListItem('listItem').run();
          }} 
          title="Recuar (Tab)"
        >
          <Indent className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton 
          onClick={() => {
            editor.chain().focus().liftListItem('taskItem').run() ||
            editor.chain().focus().liftListItem('listItem').run();
          }} 
          title="Diminuir recuo (Shift+Tab)"
        >
          <Outdent className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().setDetails().run()} isActive={editor.isActive('details')} title="Toggle (colapsável)">
          <ChevronRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} title="Código inline">
          <Code className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Link input popover */}
      {showLinkInput && (
        <div className="absolute top-12 left-3 z-50 flex items-center gap-2 p-2 bg-popover border border-border rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-100">
          <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') { setShowLinkInput(false); setLinkUrl(''); editor.chain().focus().run(); }
            }}
            placeholder="https://exemplo.com"
            className="w-56 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button onClick={applyLink} type="button" className="p-1 rounded hover:bg-muted" title="Aplicar">
            <ExternalLink className="h-4 w-4 text-primary" />
          </button>
          {editor.isActive('link') && (
            <button onClick={removeLink} type="button" className="p-1 rounded hover:bg-destructive/10" title="Remover link">
              <X className="h-4 w-4 text-destructive" />
            </button>
          )}
        </div>
      )}

      {/* BubbleMenu - native TipTap floating toolbar */}
      <BubbleMenu 
        editor={editor} 
        options={{ placement: 'top' }}
        className="flex items-center gap-0.5 p-1 bg-popover border border-border rounded-lg shadow-lg"
      >
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrito">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Itálico">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Sublinhado">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Destaque">
          <Highlighter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolbarButton onClick={openLinkInput} isActive={editor.isActive('link')} title="Link">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} title="Código">
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Título 1">
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Título 2">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </BubbleMenu>

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

      {/* Helper text + save indicator */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-muted/20">
        <div className="text-[10px] text-muted-foreground/70">
          / comandos • Ctrl+B/I/U • Ctrl+K link • Ctrl+Z/Y desfazer
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Salvando...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check className="h-3 w-3 text-primary" />
              <span className="text-primary">Salvo</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
