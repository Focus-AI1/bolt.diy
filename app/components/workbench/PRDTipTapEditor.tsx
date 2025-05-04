import React, { useEffect, useState, useRef } from 'react';
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
import styles from './PRDMarkdown.module.scss';

interface PRDTipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  onEditorReady?: (editor: Editor) => void;
  useMarkdownMode?: boolean;
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

// Markdown parser function - improved for better stability and consistency
const parseMarkdownToProseMirror = (markdown: string): string => {
  if (!markdown || typeof markdown !== 'string') return '';
  
  try {
    // Use a more robust approach with DOMParser for consistent results
    const tempDiv = document.createElement('div');
    
    // First, escape any existing HTML to prevent injection
    const escapedMarkdown = markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Process headings with careful regex to avoid capturing too much
    let processedMarkdown = escapedMarkdown
      .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
      .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
      .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
      .replace(/^#### (.*?)$/gm, '<h4>$1</h4>')
      .replace(/^##### (.*?)$/gm, '<h5>$1</h5>')
      .replace(/^###### (.*?)$/gm, '<h6>$1</h6>');
    
    // Process bold and italic with non-greedy matching
    processedMarkdown = processedMarkdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Process code blocks with careful handling of content
    processedMarkdown = processedMarkdown
      .replace(/```(.*?)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code>${code.replace(/&lt;/g, '<').replace(/&gt;/g, '>')}</code></pre>`;
      })
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Process lists with better handling of nested items
    processedMarkdown = processedMarkdown
      .replace(/^- (.*?)$/gm, '<ul><li>$1</li></ul>')
      .replace(/^(\d+)\. (.*?)$/gm, '<ol><li>$2</li></ol>');
    
    // Combine adjacent list items
    processedMarkdown = processedMarkdown
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/<\/ol>\s*<ol>/g, '');
    
    // Process blockquotes with better multiline support
    processedMarkdown = processedMarkdown
      .replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>')
      .replace(/<\/blockquote>\s*<blockquote>/g, '<br>');
    
    // Process horizontal rules
    processedMarkdown = processedMarkdown
      .replace(/^---$/gm, '<hr>');
    
    // Process links and images with careful URL handling
    processedMarkdown = processedMarkdown
      .replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
        return `<a href="${url}">${text}</a>`;
      })
      .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
        return `<img src="${url}" alt="${alt}">`;
      });
    
    // Process paragraphs with better handling of block elements
    const paragraphs = processedMarkdown.split(/\n{2,}/);
    processedMarkdown = paragraphs.map(para => {
      para = para.trim();
      if (!para || 
          para.startsWith('<h') || 
          para.startsWith('<ul') || 
          para.startsWith('<ol') || 
          para.startsWith('<blockquote') || 
          para.startsWith('<pre') || 
          para.startsWith('<hr')) {
        return para;
      }
      // Handle single line breaks within paragraphs
      return `<p>${para.replace(/\n/g, '<br>')}</p>`;
    }).join('\n\n');
    
    tempDiv.innerHTML = processedMarkdown;
    
    // Add enhanced classes to all elements
    tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
      el.classList.add('enhanced-heading');
      el.classList.add(`level-${el.tagName.toLowerCase().replace('h', '')}`);
    });
    
    tempDiv.querySelectorAll('p').forEach(el => {
      el.classList.add('enhanced-paragraph');
    });
    
    tempDiv.querySelectorAll('blockquote').forEach(el => {
      el.classList.add('enhanced-blockquote');
    });
    
    tempDiv.querySelectorAll('code').forEach(el => {
      el.classList.add('enhanced-code');
    });
    
    tempDiv.querySelectorAll('pre').forEach(el => {
      el.classList.add('enhanced-code-block');
    });
    
    tempDiv.querySelectorAll('hr').forEach(el => {
      el.classList.add('enhanced-hr');
    });
    
    tempDiv.querySelectorAll('ul').forEach(el => {
      el.classList.add('enhanced-ul');
    });
    
    tempDiv.querySelectorAll('ol').forEach(el => {
      el.classList.add('enhanced-ol');
    });
    
    tempDiv.querySelectorAll('li').forEach(el => {
      el.classList.add('enhanced-li');
    });
    
    tempDiv.querySelectorAll('a').forEach(el => {
      el.classList.add('enhanced-link');
    });
    
    tempDiv.querySelectorAll('img').forEach(el => {
      el.classList.add('enhanced-image');
    });
    
    return tempDiv.innerHTML;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return markdown;
  }
};

// Convert ProseMirror content to markdown - improved for better stability
const parseProseMirrorToMarkdown = (editor: Editor): string => {
  try {
    const html = editor.getHTML();
    
    // Use a more direct approach to convert HTML to markdown
    let markdown = '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Process each element in order
    Array.from(doc.body.children).forEach(node => {
      markdown += processNodeToMarkdown(node);
    });
    
    return markdown;
  } catch (error) {
    console.error('Error converting to markdown:', error);
    return editor.getText();
  }
};

// Helper function to process nodes to markdown
const processNodeToMarkdown = (node: Element): string => {
  if (!node) return '';
  
  const tagName = node.tagName.toLowerCase();
  const content = node.textContent?.trim() || '';
  
  switch (tagName) {
    case 'h1':
      return `# ${content}\n\n`;
    case 'h2':
      return `## ${content}\n\n`;
    case 'h3':
      return `### ${content}\n\n`;
    case 'h4':
      return `#### ${content}\n\n`;
    case 'h5':
      return `##### ${content}\n\n`;
    case 'h6':
      return `###### ${content}\n\n`;
    case 'p':
      if (!content) return '';
      
      // Process inline elements
      let paragraphContent = '';
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          paragraphContent += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as Element;
          const childTag = childEl.tagName.toLowerCase();
          
          switch (childTag) {
            case 'strong':
            case 'b':
              paragraphContent += `**${childEl.textContent}**`;
              break;
            case 'em':
            case 'i':
              paragraphContent += `*${childEl.textContent}*`;
              break;
            case 'code':
              paragraphContent += `\`${childEl.textContent}\``;
              break;
            case 'a':
              paragraphContent += `[${childEl.textContent}](${childEl.getAttribute('href')})`;
              break;
            default:
              paragraphContent += childEl.textContent;
          }
        }
      });
      
      return `${paragraphContent}\n\n`;
    case 'blockquote':
      return `> ${content}\n\n`;
    case 'pre':
      const codeEl = node.querySelector('code');
      return `\`\`\`\n${codeEl?.textContent || content}\n\`\`\`\n\n`;
    case 'code':
      return `\`${content}\``;
    case 'ul':
      let ulContent = '';
      Array.from(node.children).forEach(li => {
        ulContent += `- ${li.textContent}\n`;
      });
      return `${ulContent}\n`;
    case 'ol':
      let olContent = '';
      Array.from(node.children).forEach((li, index) => {
        olContent += `${index + 1}. ${li.textContent}\n`;
      });
      return `${olContent}\n`;
    case 'hr':
      return `---\n\n`;
    case 'img':
      return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})\n\n`;
    default:
      return content ? `${content}\n\n` : '';
  }
};

const PRDTipTapEditor = ({
  content,
  onChange,
  readOnly = false,
  className = "",
  placeholder = "Start typing your PRD content...",
  onEditorReady,
  useMarkdownMode = false // Parameter kept for backward compatibility
}: PRDTipTapEditorProps) => {
  // Track if the update is coming from internal or external source
  const [internalContent, setInternalContent] = useState(content);
  const isUpdatingRef = useRef(false);
  const lastExternalContentRef = useRef(content);
  
  // Only update internal content when external content changes
  useEffect(() => {
    if (content !== lastExternalContentRef.current) {
      lastExternalContentRef.current = content;
      setInternalContent(content);
    }
  }, [content]);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
          HTMLAttributes: {
            class: 'enhanced-heading',
            // Add level-specific class when rendered
            renderHTML: (attributes: { level: number }) => {
              return {
                level: attributes.level,
                class: `enhanced-heading level-${attributes.level}`
              };
            }
          }
        },
        paragraph: {
          HTMLAttributes: {
            class: 'enhanced-paragraph',
          }
        },
        blockquote: {
          HTMLAttributes: {
            class: 'enhanced-blockquote',
          }
        },
        code: {
          HTMLAttributes: {
            class: 'enhanced-code',
          }
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'enhanced-code-block',
          }
        },
        horizontalRule: {
          HTMLAttributes: {
            class: 'enhanced-hr',
          }
        },
        bulletList: {
          HTMLAttributes: {
            class: 'enhanced-ul',
          }
        },
        orderedList: {
          HTMLAttributes: {
            class: 'enhanced-ol',
          }
        },
        listItem: {
          HTMLAttributes: {
            class: 'enhanced-li',
          }
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Underline.configure({
        HTMLAttributes: {
          class: 'enhanced-underline',
        }
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'enhanced-image',
        }
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'enhanced-link text-blue-600 dark:text-blue-400 underline',
        }
      }),
      Typography,
      Highlight.configure({
        HTMLAttributes: {
          class: 'enhanced-highlight bg-yellow-200 dark:bg-yellow-800 rounded px-1',
        }
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'enhanced-task-list',
        }
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'enhanced-task-item',
        }
      }),
    ],
    content: parseMarkdownToProseMirror(internalContent),
    onUpdate: ({ editor }) => {
      // Prevent recursive updates
      if (isUpdatingRef.current) return;
      
      // Convert to markdown for storage
      const markdown = parseProseMirrorToMarkdown(editor);
      onChange(markdown);
    },
    editable: !readOnly,
  });

  // Update editor content when content prop changes
  useEffect(() => {
    if (editor && internalContent !== undefined) {
      // Only update if we're not already updating and content has changed
      if (isUpdatingRef.current) return;
      
      try {
        isUpdatingRef.current = true;
        
        // Get current selection and scroll position
        const selection = editor.view.state.selection;
        const scrollPosition = editor.view.dom.scrollTop;
        
        // Set content with transaction to maintain history
        const newHTML = parseMarkdownToProseMirror(internalContent);
        editor.commands.setContent(newHTML, false);
        
        // Restore selection and scroll position if user is actively editing
        if (document.activeElement === editor.view.dom) {
          try {
            // Only restore cursor position if it's valid in the new content
            if (selection.$head.pos <= editor.state.doc.content.size) {
              editor.commands.setTextSelection(selection.$head.pos);
            }
            editor.view.dom.scrollTop = scrollPosition;
          } catch (e) {
            // Ignore cursor position errors - they're not critical
            console.log('Error restoring cursor position:', e);
          }
        }
      } finally {
        // Always ensure we reset the updating flag
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }
  }, [editor, internalContent]);

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
        <EditorContent 
          editor={editor} 
          className={classNames(
            "prose dark:prose-invert max-w-none p-4",
            styles.markdownPreview, // Always apply markdown preview styles
            "markdown-editor" // Always apply markdown editor class
          )}
        />
      </div>
    </div>
  );
};

// Export both the editor and toolbar
export { Editor }; // Re-export the Editor type
export default PRDTipTapEditor;
