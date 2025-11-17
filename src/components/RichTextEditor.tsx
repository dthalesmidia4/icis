import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3 } from 'lucide-react';
import { Button } from './ui/button';
import { useEffect } from 'react';

// Helper function to clean HTML and preserve semantic structure
const cleanHtmlContent = (html: string): string => {
  // Remove Tailwind classes but keep the HTML structure
  return html
    .replace(/class="[^"]*"/g, '')
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
};

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
}

export function RichTextEditor({ content, onChange, onSave }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
          HTMLAttributes: {
            class: '',
          },
        },
        paragraph: {
          HTMLAttributes: {
            class: '',
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: '',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: '',
          },
        },
        listItem: {
          HTMLAttributes: {
            class: '',
          },
        },
        bold: {
          HTMLAttributes: {
            class: '',
          },
        },
        italic: {
          HTMLAttributes: {
            class: '',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: '',
          },
        },
        horizontalRule: {
          HTMLAttributes: {
            class: '',
          },
        },
      }),
    ],
    content: cleanHtmlContent(content || ''),
    editorProps: {
      attributes: {
        class: 'prose prose-base max-w-none focus:outline-none min-h-[500px] p-6 prose-headings:font-bold prose-h1:text-3xl prose-h1:mb-4 prose-h1:mt-6 prose-h2:text-2xl prose-h2:mb-3 prose-h2:mt-5 prose-h3:text-xl prose-h3:mb-2 prose-h3:mt-4 prose-p:mb-3 prose-p:leading-relaxed prose-ul:list-disc prose-ul:ml-6 prose-ul:mb-3 prose-ul:space-y-1 prose-ol:list-decimal prose-ol:ml-6 prose-ol:mb-3 prose-ol:space-y-1 prose-li:mb-1 prose-strong:font-semibold prose-em:italic prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-3 prose-hr:my-6 prose-hr:border-t prose-hr:border-border',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content) {
      const cleanedContent = cleanHtmlContent(content);
      const currentContent = editor.getHTML();
      
      // Only update if content is actually different (to avoid infinite loops)
      if (cleanedContent !== currentContent) {
        editor.commands.setContent(cleanedContent);
      }
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-card">
      {/* Toolbar */}
      <div className="border-b bg-muted/30 p-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('bold') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="gap-1"
        >
          <Bold className="w-4 h-4" />
          <span className="hidden sm:inline">Negrito</span>
        </Button>
        
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('italic') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="gap-1"
        >
          <Italic className="w-4 h-4" />
          <span className="hidden sm:inline">Itálico</span>
        </Button>

        <div className="w-px bg-border mx-1" />

        <Button
          type="button"
          size="sm"
          variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className="gap-1"
        >
          <Heading1 className="w-4 h-4" />
          <span className="hidden sm:inline">H1</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className="gap-1"
        >
          <Heading2 className="w-4 h-4" />
          <span className="hidden sm:inline">H2</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={editor.isActive('heading', { level: 3 }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className="gap-1"
        >
          <Heading3 className="w-4 h-4" />
          <span className="hidden sm:inline">H3</span>
        </Button>

        <div className="w-px bg-border mx-1" />

        <Button
          type="button"
          size="sm"
          variant={editor.isActive('bulletList') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="gap-1"
        >
          <List className="w-4 h-4" />
          <span className="hidden sm:inline">Lista</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={editor.isActive('orderedList') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="gap-1"
        >
          <ListOrdered className="w-4 h-4" />
          <span className="hidden sm:inline">Numerada</span>
        </Button>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}
