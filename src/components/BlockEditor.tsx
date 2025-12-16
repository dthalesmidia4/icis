import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Bold, Italic, Heading1, Heading2, Heading3, 
  List, ListOrdered, Minus, Type, Plus
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
          '[&_.is-editor-empty:first-child::before]:text-muted-foreground/50',
          '[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.is-editor-empty:first-child::before]:float-left',
          '[&_.is-editor-empty:first-child::before]:h-0',
          '[&_.is-editor-empty:first-child::before]:pointer-events-none',
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
          >
            <Italic className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              editor.isActive('heading', { level: 1 }) && "bg-muted text-primary"
            )}
            type="button"
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
          >
            <List className="h-4 w-4" />
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
              <Plus className="h-3 w-3" />
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
      <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50 pointer-events-none">
        Digite / para comandos
      </div>
    </div>
  );
}
