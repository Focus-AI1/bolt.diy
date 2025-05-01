import React, { useEffect } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { classNames } from '~/utils/classNames';

interface PRDTipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  onEditorReady?: (editor: Editor) => void;
}

// Toolbar Button Component - Refined Styling
const ToolbarButton = ({
  onClick,
  active = false,
  disabled = false,
  title, // Add title for tooltips
  children
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode
}) => (
  <button
    type="button" // Explicitly set type
    onClick={onClick}
    disabled={disabled}
    title={title} // Add title attribute
    className={classNames(
      "p-1.5 rounded transition-colors duration-150 ease-in-out", // Slightly smaller padding, smoother transition
      active
        ? "bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary"
        : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary",
      disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-100", // Clearer disabled state
      "focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus" // Consistent focus ring
    )}
  >
    {children}
  </button>
);

// Toolbar Dropdown Component - Refined Styling
const ToolbarDropdown = ({
  value,
  onChange,
  options,
  disabled = false,
  title // Add title for tooltips
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    title={title} // Add title attribute
    className={classNames(
      "px-2 py-1 rounded bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-sm font-medium", // Adjusted padding and style
      "text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus",
      disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-bolt-elements-background-depth-2"
    )}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

// Toolbar Divider Component
const ToolbarDivider = () => (
  <div className="h-5 w-px bg-bolt-elements-borderColor mx-1" /> // Vertical divider
);

// Separate Editor Toolbar Component
export const EditorToolbar = ({ editor, readOnly = false }: { editor: Editor | null, readOnly?: boolean }) => {
  if (!editor) return null;
  
  const toolbarDisabled = readOnly;
  
  return (
    <div className="flex items-center justify-between w-full border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 sticky top-0 z-10 px-4 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <ToolbarDropdown
          title="Text Style"
          value={editor.isActive('heading', { level: 1 }) ? 'h1' :
                 editor.isActive('heading', { level: 2 }) ? 'h2' :
                 editor.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph'}
          onChange={(value) => {
            if (toolbarDisabled) return;
            editor.chain().focus();
            if (value === 'paragraph') {
              editor.commands.setParagraph();
            } else {
              const level = parseInt(value.substring(1)) as 1 | 2 | 3;
              editor.commands.toggleHeading({ level });
            }
          }}
          options={[
            { value: 'paragraph', label: 'Paragraph' },
            { value: 'h1', label: 'Heading 1' },
            { value: 'h2', label: 'Heading 2' },
            { value: 'h3', label: 'Heading 3' },
          ]}
          disabled={toolbarDisabled}
        />

        <ToolbarDivider />

        <ToolbarButton
          title="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          disabled={toolbarDisabled || !editor.can().toggleBold()}
        >
          <div className="i-ph:text-b-bold w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          disabled={toolbarDisabled || !editor.can().toggleItalic()}
        >
          <div className="i-ph:text-italic w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          disabled={toolbarDisabled || !editor.can().toggleUnderline()}
        >
          <div className="i-ph:text-underline w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          disabled={toolbarDisabled || !editor.can().toggleStrike()}
        >
          <div className="i-ph:text-strikethrough w-4 h-4" />
        </ToolbarButton>
         <ToolbarButton
          title="Code"
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive('code')}
          disabled={toolbarDisabled || !editor.can().toggleCode()}
        >
          <div className="i-ph:code w-4 h-4" />
        </ToolbarButton>
         <ToolbarButton
          title="Highlight"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive('highlight')}
          disabled={toolbarDisabled || !editor.can().toggleHighlight()}
         >
           <div className="i-ph:highlighter-circle w-4 h-4" />
         </ToolbarButton>


        <ToolbarDivider />

        <ToolbarButton
          title="Bullet List"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          disabled={toolbarDisabled || !editor.can().toggleBulletList()}
        >
          <div className="i-ph:list-bullets w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered List"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          disabled={toolbarDisabled || !editor.can().toggleOrderedList()}
        >
          <div className="i-ph:list-numbers w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Task List"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          disabled={toolbarDisabled || !editor.can().toggleTaskList()}
        >
          <div className="i-ph:check-square w-4 h-4" />
        </ToolbarButton>

         <ToolbarDivider />

        <ToolbarButton
          title="Align Left"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          disabled={toolbarDisabled || !editor.can().setTextAlign('left')}
        >
          <div className="i-ph:text-align-left w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Align Center"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          disabled={toolbarDisabled || !editor.can().setTextAlign('center')}
        >
          <div className="i-ph:text-align-center w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Align Right"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          disabled={toolbarDisabled || !editor.can().setTextAlign('right')}
        >
          <div className="i-ph:text-align-right w-4 h-4" />
        </ToolbarButton>

         <ToolbarDivider />

        <ToolbarButton
          title="Set Link"
          onClick={() => {
            if (toolbarDisabled) return;
            const previousUrl = editor.getAttributes('link').href;
            const url = window.prompt('Enter URL:', previousUrl || '');
            if (url === null) return;
            if (url === '') {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
          active={editor.isActive('link')}
          disabled={toolbarDisabled}
        >
          <div className="i-ph:link w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Unset Link"
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={toolbarDisabled || !editor.isActive('link')}
        >
          <div className="i-ph:link-break w-4 h-4" />
        </ToolbarButton>
      </div>

      <div className="flex items-center">
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={toolbarDisabled || !editor.can().undo()}>
          <div className="i-ph:arrow-u-up-left w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={toolbarDisabled || !editor.can().redo()}>
          <div className="i-ph:arrow-u-up-right w-4 h-4" />
        </ToolbarButton>
      </div>
    </div>
  );
};

// Markdown parser function
const parseMarkdownToProseMirror = (markdown: string): string => {
  // This is a simplified conversion - in a real implementation,
  // you would use a proper markdown parser like remark/rehype
  const html = markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
    .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Basic paragraph handling, might need refinement for complex cases
    .split('\n\n') // Split into paragraphs based on double newline
    .map(p => p.trim())
    .filter(p => p) // Remove empty paragraphs
    .map(p => {
       // Check if it's already a block element (basic check)
       if (p.match(/^<(h[1-6]|ul|ol|li|p|blockquote|pre)/)) {
         return p;
       }
       // Wrap in paragraph if not already identified as block
       return `<p>${p}</p>`;
     })
    .join('') // Join paragraphs back
    // Simplified list conversion - needs improvement for nested lists etc.
    .replace(/<\/p>\n?<p>- (.*)/g, '<ul><li>$1</li></ul>') // Very basic unordered list start
    .replace(/<\/li><\/ul>\n?<p>- (.*)/g, '</li><li>$1</li></ul>') // Basic subsequent item
    .replace(/<\/p>\n?<p>\d+\. (.*)/g, '<ol><li>$1</li></ol>') // Very basic ordered list start
    .replace(/<\/li><\/ol>\n?<p>\d+\. (.*)/g, '</li><li>$1</li></ol>') // Basic subsequent item
    // Ensure lists are closed properly (might need more logic)
    .replace(/<\/li>\n(?!<li>)/g, '</li></ul>') // Close ul if next line is not li
    .replace(/<\/li>\n(?!<li>)/g, '</li></ol>'); // Close ol if next line is not li


  return html;
};

// Convert ProseMirror content to markdown
const parseProseMirrorToMarkdown = (editor: Editor): string => {
  // Get the HTML content from the editor
  const html = editor.getHTML();

  // Use a simple HTML-to-Markdown conversion logic
  // This is basic and may not cover all edge cases or formatting nuances.
  // Consider a more robust library like `turndown` for production.
  let markdown = html
    // Headings
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n\n')
    // Bold
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    // Italic
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    // Strikethrough
    .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
    .replace(/<del>(.*?)<\/del>/gi, '~~$1~~')
    // Underline (Note: Markdown doesn't have standard underline)
    .replace(/<u>(.*?)<\/u>/gi, '$1') // Remove underline tags or use custom syntax if needed
    // Links
    .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
    // Code blocks
    .replace(/<pre><code>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n')
    // Inline code
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    // Lists (basic conversion, might need refinement for nested lists)
    .replace(/<ul>\n?<li>(.*?)<\/li>\n?<\/ul>/gis, (match, p1) => `- ${p1.replace(/<\/li>\n?<li>/g, '\n- ')}\n\n`)
    .replace(/<ol>\n?<li>(.*?)<\/li>\n?<\/ol>/gis, (match, p1) => {
      let count = 1;
      return p1.replace(/<\/li>\n?<li>/g, () => `\n${++count}. `).replace(/^/, `${count}. `) + '\n\n';
    })
    // Paragraphs
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    // Remove remaining HTML tags (simplistic)
    .replace(/<[^>]+>/g, '')
    // Clean up extra newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return markdown;
};

const PRDTipTapEditor = ({
  content,
  onChange,
  readOnly = false,
  className = "",
  placeholder = "Start typing your PRD content...",
  onEditorReady
}: PRDTipTapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image,
      Link,
      Typography,
      Highlight,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const markdown = parseProseMirrorToMarkdown(editor);
      onChange(markdown);
    },
    editable: !readOnly,
  });

  // Update editor content when content prop changes
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      // Only update if content has actually changed to avoid cursor jumping
      const currentPosition = editor.view.state.selection.$head.pos;
      editor.commands.setContent(content, false);
      
      // Try to maintain cursor position if user is actively editing
      if (document.activeElement === editor.view.dom) {
        try {
          // Only restore cursor position if it's valid in the new content
          if (currentPosition <= editor.state.doc.content.size) {
            editor.commands.setTextSelection(currentPosition);
          }
        } catch (e) {
          // Ignore cursor position errors - they're not critical
        }
      }
    }
  }, [editor, content]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  // Provide the editor instance to the parent component
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`prd-editor w-full ${className}`}>
      {/* Editor content with proper styling */}
      <div className={`border ${readOnly ? 'border-transparent' : 'border-bolt-elements-borderColor'} rounded-md overflow-hidden`}>
        <EditorContent editor={editor} className="prose max-w-none p-4" />
      </div>
    </div>
  );
};

// Export both the editor and toolbar
export { Editor }; // Re-export the Editor type
export default PRDTipTapEditor;
