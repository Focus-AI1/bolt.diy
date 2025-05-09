import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import { classNames } from '~/utils/classNames';
import styles from './PRDMarkdown.module.scss';
import toolbarStyles from './PRDToolbar.module.scss';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import FontFamily from '@tiptap/extension-font-family';
import TextStyle from '@tiptap/extension-text-style';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PRDTipTapEditor');

interface PRDTipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  onEditorReady?: (editor: Editor) => void;
  useMarkdownMode?: boolean;
}

// Modern Toolbar Button Component
export const ToolbarButton = ({
  onClick,
  active = false,
  disabled = false,
  title,
  children
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={classNames(
      toolbarStyles.toolbarButton,
      active ? toolbarStyles.active : '',
      disabled ? toolbarStyles.disabled : ''
    )}
  >
    {children}
    {title && <span className={toolbarStyles.tooltip}>{title}</span>}
  </button>
);

// Modern Toolbar Dropdown Component
export const ToolbarDropdown = ({
  value,
  onChange,
  options,
  disabled = false,
  title,
  customSelectClass
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
  customSelectClass?: string;
}) => (
  <div className={toolbarStyles.toolbarDropdown} title={title}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${disabled ? toolbarStyles.disabled : ''} ${customSelectClass ? toolbarStyles[customSelectClass] : ''}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

// Separate Editor Toolbar Component
export const EditorToolbar = ({ editor, readOnly = false }: { editor: Editor | null, readOnly?: boolean }) => {
  if (!editor) return null;
  
  const toolbarDisabled = readOnly;
  
  return (
    <div className={toolbarStyles.toolbar}>
      <div className={toolbarStyles.toolbarContent}>
        {/* Text Style Group */}
        <div className={toolbarStyles.buttonGroup}>
          <ToolbarDropdown
            title="Text Style"
            value={editor.isActive('heading', { level: 1 }) ? 'h1' :
                   editor.isActive('heading', { level: 2 }) ? 'h2' :
                   editor.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph'}
            onChange={(value) => {
              if (toolbarDisabled) return;
              editor.chain().focus();
              if (value === 'paragraph') {
                (editor.chain().focus() as any).setParagraph().run();
              } else if (value === 'h1') {
                editor.chain().focus().setHeading({ level: 1 }).run();
              } else if (value === 'h2') {
                editor.chain().focus().setHeading({ level: 2 }).run();
              } else if (value === 'h3') {
                editor.chain().focus().setHeading({ level: 3 }).run();
              }
            }}
            options={[
              { value: 'paragraph', label: 'Normal Text' },
              { value: 'h1', label: 'Heading 1' },
              { value: 'h2', label: 'Heading 2' },
              { value: 'h3', label: 'Heading 3' },
            ]}
            disabled={toolbarDisabled}
          />
          
          {/* Font Family Dropdown */}
          <ToolbarDropdown
            title="Font Family"
            value={(() => {
              // Get the current font family
              const attrs = editor.getAttributes('textStyle');
              return attrs.fontFamily || 'default';
            })()}
            onChange={(value) => {
              if (toolbarDisabled) return;
              if (value === 'default') {
                // Remove font family by setting it to null
                editor.chain().focus().setMark('textStyle', { fontFamily: null }).run();
              } else {
                // Set font family
                editor.chain().focus().setMark('textStyle', { fontFamily: value }).run();
              }
            }}
            customSelectClass="fontFamilyDropdown"
            options={[
              { value: 'default', label: 'Default Font' },
              { value: 'Arial, sans-serif', label: 'Arial' },
              { value: 'Georgia, serif', label: 'Georgia' },
              { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
              { value: 'Verdana, sans-serif', label: 'Verdana' },
              { value: '"Courier New", Courier, monospace', label: 'Courier New' },
              { value: 'system-ui, sans-serif', label: 'System UI' },
            ]}
            disabled={toolbarDisabled}
          />
          
          {/* Font Size Dropdown */}
          <ToolbarDropdown
            title="Font Size"
            value={(() => {
              // Get the current font size from inline style
              const attrs = editor.getAttributes('textStyle');
              return attrs.fontSize || 'default';
            })()}
            onChange={(value) => {
              if (toolbarDisabled) return;
              if (value === 'default') {
                // Remove font size by setting it to null
                editor.chain().focus().setMark('textStyle', { fontSize: null }).run();
              } else {
                // Set font size
                editor.chain().focus().setMark('textStyle', { fontSize: value }).run();
              }
            }}
            customSelectClass="fontSizeDropdown"
            options={[
              { value: 'default', label: 'Default Size' },
              { value: '8px', label: 'Tiny' },
              { value: '12px', label: 'Small' },
              { value: '16px', label: 'Normal' },
              { value: '20px', label: 'Large' },
              { value: '24px', label: 'X-Large' },
              { value: '32px', label: 'XX-Large' },
            ]}
            disabled={toolbarDisabled}
          />
        </div>
        
        {/* Text Formatting Group */}
        <div className={toolbarStyles.buttonGroup}>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-bold" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic" 
            disabled={toolbarDisabled}
          >
            <i className="fas fa-italic" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="Underline"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-underline" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Strikethrough"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-strikethrough" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
            title="Highlight"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-highlighter" />
          </ToolbarButton>
        </div>
        
        {/* List Group */}
        <div className={toolbarStyles.buttonGroup}>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet List"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-list-ul" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered List"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-list-ol" />
          </ToolbarButton>
        </div>
        
        {/* Block Elements Group */}
        <div className={toolbarStyles.buttonGroup}>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="Blockquote"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-quote-right" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-minus" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => {
              const diagramContent = 'graph TD\n    A[Start] --> B[Process]\n    B --> C[End]';
              editor.chain().focus().setCodeBlock({ language: 'mermaid' }).insertContent(diagramContent).run();
            }}
            active={editor.isActive('codeBlock', { language: 'mermaid' })}
            title="Insert Diagram"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-project-diagram" />
          </ToolbarButton>
        </div>
        
        {/* Media Group */}
        <div className={toolbarStyles.buttonGroup}>
          <ToolbarButton 
            onClick={() => {
              const url = window.prompt('Enter the URL:');
              if (url) {
                if (editor.isActive('link')) {
                  editor.chain().focus().unsetLink().run();
                }
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            active={editor.isActive('link')}
            title="Insert Link"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-link" />
          </ToolbarButton>
          
          <ToolbarButton 
            onClick={() => {
              const url = window.prompt('Enter the image URL:');
              if (url) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            }}
            title="Insert Image"
            disabled={toolbarDisabled}
          >
            <i className="fas fa-image" />
          </ToolbarButton>
        </div>
        
        {/* Alignment Group */}
        <div className={toolbarStyles.buttonGroup}>
          <ToolbarDropdown
            title="Text Align"
            value={editor.isActive({ textAlign: 'left' }) ? 'left' :
                   editor.isActive({ textAlign: 'center' }) ? 'center' :
                   editor.isActive({ textAlign: 'right' }) ? 'right' :
                   editor.isActive({ textAlign: 'justify' }) ? 'justify' : 'left'}
            onChange={(value) => {
              if (toolbarDisabled) return;
              editor.chain().focus().setTextAlign(value as 'left' | 'center' | 'right' | 'justify').run();
            }}
            options={[
              { value: 'left', label: 'Align Left' },
              { value: 'center', label: 'Align Center' },
              { value: 'right', label: 'Align Right' },
              { value: 'justify', label: 'Justify' },
            ]}
            disabled={toolbarDisabled}
          />
        </div>
      </div>
    </div>
  );
};

// Fix the markdown parser to better handle code blocks and nested structures
const parseMarkdownToProseMirror = (markdown: string): string => {
  if (!markdown) return '';
  
  try {
    // First, normalize newlines for consistent processing
    let normalizedMarkdown = markdown.replace(/\r\n/g, '\n');
    
    // Create a temporary element to render markdown
    const tempElement = document.createElement('div');
    
    // Preserve code blocks before other processing
    // This is crucial to prevent interference with list parsing
    const codeBlocks: {[key: string]: string} = {};
    let codeBlockCount = 0;
    
    normalizedMarkdown = normalizedMarkdown.replace(/```([a-z]*)\n([\s\S]*?)```/g, (match: string, language: string, content: string) => {
      const placeholder = `CODE_BLOCK_PLACEHOLDER_${codeBlockCount}`;
      
      // Create properly formatted code block with language header if specified
      let codeHtml = '';
      if (language && language.trim() !== '') {
        codeHtml += `<div class="code-block-header">${language}</div>`;
      }
      
      // Preserve indentation and whitespace exactly as in the original
      const escapedContent = content
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Preserve leading spaces and tabs (crucial for code formatting)
        .replace(/^([ \t]+)(.*)$/gm, (match: string, indent: string, line: string) => {
          // Calculate the indentation level
          const indentLevel = indent.replace(/\t/g, '  ').length / 2;
          return `<span class="indented-code" style="padding-left: ${indentLevel}em;">${line}</span>`;
        });
      
      codeHtml += `<pre class="${language ? 'code-block-with-header' : ''}"><code class="language-${language || 'text'}">${escapedContent}</code></pre>`;
      codeBlocks[placeholder] = codeHtml;
      codeBlockCount++;
      return placeholder;
    });
    
    // Special handling for mermaid diagrams
    normalizedMarkdown = normalizedMarkdown.replace(/CODE_BLOCK_PLACEHOLDER_(\d+)/g, (match: string, index: string) => {
      if (codeBlocks[match]?.includes('language-mermaid')) {
        const content = codeBlocks[match]
          .replace(/<div class="code-block-header">mermaid<\/div>/, '')
          .replace(/<pre><code class="language-mermaid">/, '')
          .replace(/<\/code><\/pre>/, '')
          .trim();
        
        return `<div class="mermaid">${content}</div>`;
      }
      
      return codeBlocks[match] || match;
    });
    
    // Process inline code
    normalizedMarkdown = normalizedMarkdown.replace(/`([^`]+)`/g, '<code class="enhanced-code">$1</code>');
    
    // Process headers
    normalizedMarkdown = normalizedMarkdown.replace(/^(#{1,6})\s+(.+)$/gm, (match: string, hashes: string, content: string) => {
      const level = hashes.length;
      return `<h${level} class="enhanced-heading">${content.trim()}</h${level}>`;
    });
    
    // Process bold and italic
    normalizedMarkdown = normalizedMarkdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    normalizedMarkdown = normalizedMarkdown.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Process horizontal rule
    normalizedMarkdown = normalizedMarkdown.replace(/^---+$/gm, '<hr class="enhanced-hr">');
    
    // Process blockquotes with better multiline support and nested content preservation
    let blockquoteLevel = 0;
    let blockquoteContents = [''];
    const bqLines = normalizedMarkdown.split('\n');
    const bqProcessedLines = [];
    
    for (let i = 0; i < bqLines.length; i++) {
      const line = bqLines[i];
      // Match blockquotes with any number of '>' characters
      const blockquoteMatch = line.match(/^(>+)\s*(.*)$/);
      
      if (blockquoteMatch) {
        const quoteDepth = blockquoteMatch[1].length;
        const content = blockquoteMatch[2];
        
        // Handle nested blockquotes
        if (quoteDepth > blockquoteLevel) {
          // Starting a new (possibly nested) blockquote
          while (blockquoteLevel < quoteDepth) {
            blockquoteLevel++;
            blockquoteContents[blockquoteLevel] = content;
          }
        } else if (quoteDepth < blockquoteLevel) {
          // Closing nested blockquotes
          while (blockquoteLevel > quoteDepth) {
            // Close each level of nesting
            const nestedContent = blockquoteContents[blockquoteLevel];
            blockquoteContents[blockquoteLevel - 1] += `<blockquote class="enhanced-blockquote">${nestedContent}</blockquote>`;
            blockquoteContents[blockquoteLevel] = '';
            blockquoteLevel--;
          }
          // Add content to current level
          if (blockquoteContents[blockquoteLevel].length > 0) {
            blockquoteContents[blockquoteLevel] += '<br/>';
          }
          blockquoteContents[blockquoteLevel] += content;
        } else {
          // Continue current blockquote level
          if (blockquoteContents[blockquoteLevel].length > 0 && content.trim().length > 0) {
            // Add paragraph break if not empty
            blockquoteContents[blockquoteLevel] += '<br/>';
          }
          blockquoteContents[blockquoteLevel] += content;
        }
      } else {
        // Close all open blockquotes when reaching non-blockquote line
        while (blockquoteLevel > 0) {
          const content = blockquoteContents[blockquoteLevel];
          if (blockquoteLevel > 1) {
            blockquoteContents[blockquoteLevel - 1] += `<blockquote class="enhanced-blockquote">${content}</blockquote>`;
          } else {
            // Top level blockquote
            bqProcessedLines.push(`<blockquote class="enhanced-blockquote">${content}</blockquote>`);
          }
          blockquoteContents[blockquoteLevel] = '';
          blockquoteLevel--;
        }
        bqProcessedLines.push(line);
      }
    }
    
    // Close any remaining open blockquotes
    while (blockquoteLevel > 0) {
      const content = blockquoteContents[blockquoteLevel];
      if (blockquoteLevel > 1) {
        blockquoteContents[blockquoteLevel - 1] += `<blockquote class="enhanced-blockquote">${content}</blockquote>`;
      } else {
        bqProcessedLines.push(`<blockquote class="enhanced-blockquote">${content}</blockquote>`);
      }
      blockquoteContents[blockquoteLevel] = '';
      blockquoteLevel--;
    }
    
    normalizedMarkdown = bqProcessedLines.join('\n');
    
    // Preprocess ordered lists to ensure proper numbering
    // First, identify all ordered list sequences
    const olSequences: {start: number, end: number, level: number}[] = [];
    const olLines = normalizedMarkdown.split('\n');
    let currentSequenceStart = -1;
    let currentIndentLevel = -1;
    
    for (let i = 0; i < olLines.length; i++) {
      const olMatch = olLines[i].match(/^(\s*)(\d+)\.\s+(.+)$/);
      
      if (olMatch) {
        const [, indent, number, content] = olMatch;
        const indentLevel = indent.length;
        
        if (currentSequenceStart === -1) {
          // Start a new sequence
          currentSequenceStart = i;
          currentIndentLevel = indentLevel;
        } else if (indentLevel !== currentIndentLevel) {
          // Different indent level, end current sequence and start a new one
          if (currentSequenceStart !== -1 && i - 1 >= currentSequenceStart) {
            olSequences.push({
              start: currentSequenceStart,
              end: i - 1,
              level: currentIndentLevel
            });
          }
          currentSequenceStart = i;
          currentIndentLevel = indentLevel;
        }
      } else if (currentSequenceStart !== -1) {
        // End of a sequence
        olSequences.push({
          start: currentSequenceStart,
          end: i - 1,
          level: currentIndentLevel
        });
        currentSequenceStart = -1;
        currentIndentLevel = -1;
      }
    }
    
    // Handle the case where the file ends with an ordered list
    if (currentSequenceStart !== -1) {
      olSequences.push({
        start: currentSequenceStart,
        end: olLines.length - 1,
        level: currentIndentLevel
      });
    }
    
    // Now process each ordered list sequence to ensure proper numbering
    for (const sequence of olSequences) {
      for (let i = sequence.start; i <= sequence.end; i++) {
        const olMatch = olLines[i].match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (olMatch) {
          const [, indent, number, content] = olMatch;
          // Replace with the correct sequential number (1-indexed from the start of the sequence)
          const sequentialNumber = i - sequence.start + 1;
          olLines[i] = `${indent}${sequentialNumber}. ${content}`;
        }
      }
    }
    
    normalizedMarkdown = olLines.join('\n');
    
    // Process nested lists with proper nesting (complex task that requires tracking indentation)
    // Track list processing separately for ordered and unordered lists
    let result = '';
    const lines = normalizedMarkdown.split('\n');
    let i = 0;
    
    // Stack to track list nesting
    const listStack: {type: string, indent: number, counter: number}[] = [];
    
    // Helper function to get the correct list item attributes based on type
    const getListItemAttributes = (type: string, number: number | null) => {
      let attributes = 'class="enhanced-li"';
      
      if (type === 'ol' && number !== null) {
        attributes = `value="${number}" class="enhanced-li"`;
      }
      
      return attributes;
    };
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Unordered list detection (both * and - are supported)
      const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
      // Ordered list detection
      const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
      
      if (olMatch) {
        // Handle ordered list
        const [, indent, number, content] = olMatch;
        const indentLevel = indent.length;
        
        // Close deeper lists if needed
        while (listStack.length > 0 && listStack[listStack.length - 1].indent > indentLevel) {
          const item = listStack.pop();
          result += item?.type === 'ul' ? '</ul>' : item?.type === 'ol' ? '</ol>' : '';
        }
        
        // Start a new ordered list if needed
        if (listStack.length === 0 || listStack[listStack.length - 1].type !== 'ol' || listStack[listStack.length - 1].indent !== indentLevel) {
          if (listStack.length > 0 && listStack[listStack.length - 1].indent < indentLevel) {
            // Nested within another list
            result += `<ol class="enhanced-ol" style="--list-level: ${indentLevel / 2}">`;
          } else {
            // New top-level ordered list
            if (listStack.length > 0 && listStack[listStack.length - 1].indent === indentLevel) {
              // Close previous list of different type at same level
              const item = listStack.pop();
              result += item?.type === 'ul' ? '</ul>' : item?.type === 'ol' ? '</ol>' : '';
            }
            // Use the actual number from the markdown as the start attribute
            const startNum = parseInt(number);
            result += `<ol start="${startNum}" class="enhanced-ol" style="--list-level: ${indentLevel / 2}">`;
          }
          listStack.push({type: 'ol', indent: indentLevel, counter: parseInt(number)});
        } else {
          // Continue existing list
          result += '</li>';
          // Update the counter
          listStack[listStack.length - 1].counter++;
        }
        
        result += `<li ${getListItemAttributes('ol', listStack[listStack.length - 1].counter)}>${content}`;
      } else if (ulMatch) {
        // Handle unordered list
        const [, indent, content] = ulMatch;
        const indentLevel = indent.length;
        
        // Close deeper lists if needed
        while (listStack.length > 0 && listStack[listStack.length - 1].indent > indentLevel) {
          const item = listStack.pop();
          result += item?.type === 'ul' ? '</ul>' : item?.type === 'ol' ? '</ol>' : '';
        }
        
        // Start a new unordered list if needed
        if (listStack.length === 0 || listStack[listStack.length - 1].type !== 'ul' || listStack[listStack.length - 1].indent !== indentLevel) {
          if (listStack.length > 0 && listStack[listStack.length - 1].indent < indentLevel) {
            // Nested within another list
            result += `<ul class="enhanced-ul" style="--list-level: ${indentLevel / 2}">`;
          } else {
            // New top-level unordered list
            if (listStack.length > 0 && listStack[listStack.length - 1].indent === indentLevel) {
              // Close previous list of different type at same level
              const item = listStack.pop();
              result += item?.type === 'ul' ? '</ul>' : item?.type === 'ol' ? '</ol>' : '';
            }
            result += `<ul class="enhanced-ul" style="--list-level: ${indentLevel / 2}">`;
          }
          listStack.push({type: 'ul', indent: indentLevel, counter: 1});
        } else {
          // Continue existing list
          result += '</li>';
        }
        
        result += `<li ${getListItemAttributes('ul', null)}>${content}`;
      } else {
        // Not a list item - close all open lists
        while (listStack.length > 0) {
          const item = listStack.pop();
          result += '</li>';
          result += item?.type === 'ul' ? '</ul>' : item?.type === 'ol' ? '</ol>' : '';
        }
        
        // Process images and links before adding non-list content
        let processedLine = line
          .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="enhanced-image">')
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="enhanced-link">$1</a>');
        
        // Re-insert code blocks
        processedLine = processedLine.replace(/CODE_BLOCK_PLACEHOLDER_(\d+)/g, (match: string, index: string) => {
          return codeBlocks[match] || match;
        });
        
        if (processedLine.trim() !== '' && 
            !processedLine.startsWith('<h') && 
            !processedLine.startsWith('<blockquote') && 
            !processedLine.startsWith('<hr') && 
            !processedLine.startsWith('<pre') && 
            !processedLine.startsWith('<div class="code-block-header"') &&
            !processedLine.startsWith('<div class="diagram-container"')) {
          // Wrap in paragraph if not already a block element
          result += `<p class="enhanced-paragraph">${processedLine}</p>`;
        } else {
          result += processedLine;
        }
      }
      
      i++;
    }
    
    // Close any remaining open lists
    while (listStack.length > 0) {
      const item = listStack.pop();
      result += '</li>';
      result += item?.type === 'ul' ? '</ul>' : item?.type === 'ol' ? '</ol>' : '';
    }
    
    return result;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return `<p>${markdown}</p>`;
  }
};

// Convert ProseMirror content to markdown with improved support for hierarchical elements
const parseProseMirrorToMarkdown = (editor: Editor): string => {
  try {
    const html = editor.getHTML();
    
    // Use a more direct approach to convert HTML to markdown
    let markdown = '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Process each element in order
    const processNode = (node: Element, level = 0): string => {
      if (!node) return '';
      
      const tagName = node.tagName.toLowerCase();
      const content = node.textContent?.trim() || '';
      const indent = ' '.repeat(level * 2); // Create proper indentation for nested items
      
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
          
          // Process inline elements (bold, italic, links, etc.)
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
                case 'img':
                  paragraphContent += `![${childEl.getAttribute('alt') || ''}](${childEl.getAttribute('src') || ''})`;
                  break;
                default:
                  paragraphContent += childEl.textContent;
              }
            }
          });
          
          return `${paragraphContent}\n\n`;
        case 'blockquote':
          // Handle nested blockquotes and preserve paragraph structure
          // Split content by paragraphs and prefix each with '> '
          const blockquoteLines = content.split('\n');
          const formattedQuote = blockquoteLines
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => `> ${line}`)
            .join('\n');
          return `${formattedQuote}\n\n`;
        case 'pre':
          // Check if this is part of a code block with header
          const prevSibling = node.previousElementSibling;
          const language = prevSibling?.classList.contains('code-block-header') 
            ? prevSibling.textContent?.trim() 
            : '';
          
          // Process the code content with preserved indentation
          let codeContent = '';
          const codeEl = node.querySelector('code');
          
          if (codeEl) {
            // Extract code content with preserved indentation
            const codeLines: string[] = [];
            Array.from(codeEl.childNodes).forEach(child => {
              if (child.nodeType === Node.TEXT_NODE) {
                // Direct text nodes are added as-is
                const lines = child.textContent?.split('\n') || [];
                codeLines.push(...lines);
              } else if (child.nodeType === Node.ELEMENT_NODE) {
                const childEl = child as Element;
                if (childEl.classList.contains('indented-code')) {
                  // Extract indentation level from style
                  const indentMatch = childEl.getAttribute('style')?.match(/padding-left:\s*([0-9.]+)em/);
                  const indentLevel = indentMatch ? parseFloat(indentMatch[1]) : 0;
                  const spaces = ' '.repeat(Math.round(indentLevel * 2));
                  codeLines.push(`${spaces}${childEl.textContent}`);
                } else {
                  codeLines.push(childEl.textContent || '');
                }
              }
            });
            
            codeContent = codeLines.join('\n');
          } else {
            codeContent = node.textContent || '';
          }
          
          return `\`\`\`${language || ''}\n${codeContent}\n\`\`\`\n\n`;
        case 'code':
          return `\`${content}\``;
        case 'ul':
          let ulContent = '';
          Array.from(node.children).forEach(li => {
            // Extract direct content only (excluding nested lists)
            let itemContent = '';
            
            // Extract the direct text content, excluding nested lists
            Array.from(li.childNodes).forEach(child => {
              if (child.nodeType === Node.TEXT_NODE || 
                  (child.nodeType === Node.ELEMENT_NODE && 
                   !(child as Element).tagName.toLowerCase().match(/^(ul|ol)$/))) {
                itemContent += child.textContent;
              }
            });
            
            itemContent = itemContent.trim();
            const nestedContent = processNestedLists(li as Element, level + 1);
            ulContent += `${indent}- ${itemContent}${nestedContent ? '\n' + nestedContent : ''}\n`;
          });
          return ulContent + (level === 0 ? '\n' : '');
        case 'ol':
          let olContent = '';
          // Get the start attribute if it exists
          const startAttr = node.getAttribute('start');
          const startNum = startAttr ? parseInt(startAttr) : 1;
          
          // Process each list item with its correct number
          Array.from(node.children).forEach((li, index) => {
            // Get the value attribute if it exists, otherwise use sequential numbering
            const valueAttr = li.getAttribute('value');
            const itemNumber = valueAttr ? parseInt(valueAttr) : startNum + index;
            
            // Extract direct content only (excluding nested lists)
            let itemContent = '';
            
            // Extract the direct text content, excluding nested lists
            Array.from(li.childNodes).forEach(child => {
              if (child.nodeType === Node.TEXT_NODE || 
                  (child.nodeType === Node.ELEMENT_NODE && 
                   !(child as Element).tagName.toLowerCase().match(/^(ul|ol)$/))) {
                itemContent += child.textContent;
              }
            });
            
            itemContent = itemContent.trim();
            const nestedContent = processNestedLists(li as Element, level + 1);
            olContent += `${indent}${itemNumber}. ${itemContent}${nestedContent ? '\n' + nestedContent : ''}\n`;
          });
          return olContent + (level === 0 ? '\n' : '');
        case 'hr':
          return `---\n\n`;
        case 'div':
          // Skip code block headers - they're handled with the pre element
          if (node.classList.contains('code-block-header')) {
            return '';
          }
          
          // Special handling for mermaid diagrams
          if (node.classList.contains('diagram-container')) {
            const mermaidDiv = node.querySelector('.mermaid');
            if (mermaidDiv) {
              return `\`\`\`mermaid\n${mermaidDiv.textContent?.trim()}\n\`\`\`\n\n`;
            }
          }
          
          // Process all children
          let childMarkdown = '';
          Array.from(node.children).forEach(child => {
            childMarkdown += processNode(child as Element, level);
          });
          return childMarkdown;
        default:
          // Process all children for unknown elements
          let unknownMarkdown = '';
          Array.from(node.children).forEach(child => {
            unknownMarkdown += processNode(child as Element, level);
          });
          return unknownMarkdown || (content ? `${content}\n\n` : '');
      }
    };
    
    // Helper function to process nested lists
    const processNestedLists = (node: Element, level: number): string => {
      let result = '';
      // Look for nested lists
      const nestedUl = node.querySelector(':scope > ul');
      const nestedOl = node.querySelector(':scope > ol');
      
      if (nestedUl || nestedOl) {
        const nestedList = nestedUl || nestedOl;
        if (nestedList) {
          result = processNode(nestedList, level);
        }
      }
      return result;
    };
    
    // Start processing from the body
    Array.from(doc.body.children).forEach(node => {
      markdown += processNode(node as Element);
    });
    
    return markdown;
  } catch (error) {
    console.error('Error converting to markdown:', error);
    return editor.getText();
  }
};

// Create a custom extension for line highlighting
const CursorLineHighlight = Extension.create({
  name: 'cursorLineHighlight',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('cursorLineHighlight'),
        props: {
          decorations(state) {
            const { doc, selection } = state;
            const decorations: any[] = [];

            // Add the current cursor position decoration
            if (selection.empty) {
              doc.nodesBetween(selection.from, selection.to, (node, pos) => {
                // Find the parent paragraph or block element
                const $from = state.doc.resolve(pos);
                let parentDepth = $from.depth;
                
                // Find the appropriate block-level parent
                while (parentDepth > 0) {
                  const nodeAtDepth = $from.node(parentDepth);
                  
                  // Only highlight block elements for cleaner experience
                  if (nodeAtDepth.isBlock) {
                    const start = $from.before(parentDepth);
                    const end = $from.after(parentDepth);
                    
                    const decoration = Decoration.node(start, end, {
                      class: 'highlight-line'
                    });
                    
                    decorations.push(decoration);
                    return false; // Stop once we've found a suitable block
                  }
                  
                  parentDepth--;
                }
                return true;
              });
            }

            return DecorationSet.create(doc, decorations);
          }
        }
      })
    ];
  }
});

// Custom Keyboard Handlers Extension for better indentation support
const KeyboardExtension = Extension.create({
  name: 'customKeyboard',

  addKeyboardShortcuts() {
    return {
      // Handle Tab key for indentation
      Tab: ({ editor }) => {
        // If in a list, use built-in indentation
        if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
          return editor.commands.sinkListItem('listItem');
        }
        
        // In a code block, insert spaces or tab character
        if (editor.isActive('codeBlock')) {
          return editor.commands.insertContent('\t');
        }
        
        // In normal text, insert spaces for indentation (4 spaces is standard)
        return editor.commands.insertContent('    ');
      },
      
      // Handle Shift+Tab for outdenting
      'Shift-Tab': ({ editor }) => {
        // If in a list, use built-in outdentation
        if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
          return editor.commands.liftListItem('listItem');
        }
        
        return false; // Let default behavior happen for other contexts
      },
      
      // Ensure Enter key creates proper new lines
      Enter: ({ editor }) => {
        // Let the default behavior work in most cases
        return false;
      }
    };
  },
});

// Component for code block with copy button functionality
const CodeBlockExtension = Extension.create({
  name: 'codeBlockWithCopy',
  
  addNodeView() {
    return ({ node, editor, getPos }: { node: any; editor: any; getPos: any }) => {
      const dom = document.createElement('pre');
      dom.classList.add('enhanced-code-block');
      
      const code = document.createElement('code');
      code.innerHTML = node.textContent;
      dom.appendChild(code);
      
      // Add copy button
      const copyButton = document.createElement('button');
      copyButton.classList.add('copy-button');
      copyButton.textContent = 'Copy';
      copyButton.style.display = 'none'; // Hide initially
      
      // Show button on hover
      dom.addEventListener('mouseenter', () => {
        copyButton.style.display = 'block';
      });
      
      dom.addEventListener('mouseleave', () => {
        copyButton.style.display = 'none';
      });
      
      // Copy functionality
      copyButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        navigator.clipboard.writeText(node.textContent);
        
        // Visual feedback
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 2000);
      });
      
      dom.appendChild(copyButton);
      
      // Add line numbers
      const codeLines = node.textContent ? node.textContent.split('\n') : [];
      const codeWithLines = document.createElement('div');
      codeWithLines.classList.add('code-with-lines');
      
      codeLines.forEach((line: string, index: number) => {
        const lineElement = document.createElement('div');
        lineElement.classList.add('code-line');
        lineElement.setAttribute('data-line', (index + 1).toString());
        lineElement.textContent = line;
        codeWithLines.appendChild(lineElement);
      });
      
      code.innerHTML = '';
      code.appendChild(codeWithLines);
      
      return {
        dom,
        update: (updatedNode: any) => {
          if (updatedNode.type.name !== 'codeBlock') return false;
          
          // Update content if node changes
          const updatedLines = updatedNode.textContent.split('\n');
          codeWithLines.innerHTML = '';
          
          updatedLines.forEach((line: string, index: number) => {
            const lineElement = document.createElement('div');
            lineElement.classList.add('code-line');
            lineElement.setAttribute('data-line', (index + 1).toString());
            lineElement.textContent = line;
            codeWithLines.appendChild(lineElement);
          });
          
          return true;
        }
      };
    };
  }
});

const PRDTipTapEditor = ({
  content,
  onChange,
  readOnly = false,
  className = "",
  placeholder = "Start typing your PRD content...",
  onEditorReady,
  useMarkdownMode = false // Parameter kept for backward compatibility
}: PRDTipTapEditorProps) => {
  const [internalContent, setInternalContent] = useState<string>(content || '');
  // Removed showEditorToolbar state since toolbar is moved to parent component
  const isUpdatingRef = useRef(false);
  const [modeTransition, setModeTransition] = useState(false);
  
  // Update internal content when prop changes
  useEffect(() => {
    setInternalContent(content);
  }, [content]);

  // Initialize editor with enhanced features
  const editor = useEditor({
    extensions: [
      // Configure StarterKit with our customizations
      StarterKit.configure({
        // Configure heading levels
        heading: {
          levels: [1, 2, 3],
        },
        // Disable codeBlock as we'll use our custom extension
        codeBlock: false,
        // Configure list items with custom classes
        bulletList: {
          keepAttributes: true,
          HTMLAttributes: {
            class: 'enhanced-ul',
          }
        },
        orderedList: {
          keepAttributes: true,
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
      // Add placeholder extension
      Placeholder.configure({
        placeholder,
      }),
      // Add extensions not included in StarterKit
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image,
      Link,
      Typography,
      Highlight,
      // Add our custom extensions
      CursorLineHighlight,
      KeyboardExtension,
      CodeBlockExtension,
      // Add text styling extensions
      TextStyle,
      FontFamily.configure({
        types: ['textStyle'],
      }),
      // Custom extension for font size support
      Extension.create({
        name: 'fontSize',
        addOptions() {
          return {
            types: ['textStyle'],
          };
        },
        addGlobalAttributes() {
          return [
            {
              types: this.options.types,
              attributes: {
                fontSize: {
                  default: null,
                  parseHTML: (element: HTMLElement) => element.style.fontSize,
                  renderHTML: (attributes: Record<string, any>) => {
                    if (!attributes.fontSize) {
                      return {};
                    }
                    return {
                      style: `font-size: ${attributes.fontSize}`,
                    };
                  },
                },
              },
            },
          ];
        },
      }),
    ],
    content: parseMarkdownToProseMirror(internalContent),
    onUpdate: ({ editor }) => {
      // Prevent recursive updates
      if (isUpdatingRef.current) return;
      
      // Convert to markdown for storage
      const markdown = parseProseMirrorToMarkdown(editor);
      
      // Set updating flag before triggering onChange
      isUpdatingRef.current = true;
      onChange(markdown);
      
      // Reset flag after a short delay
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 10);
    },
    editable: !readOnly,
  });
  
  // Track the last content we received from props to detect actual changes
  const lastPropContentRef = useRef<string>(content);
  
  // Update editor content when content prop changes
  useEffect(() => {
    if (!editor || internalContent === undefined) return;
    
    // Skip update if we're already in the middle of an update
    if (isUpdatingRef.current) return;
    
    // Skip if content hasn't actually changed (prevents unnecessary re-renders)
    if (content === lastPropContentRef.current) return;
    
    // Update our reference of the last prop content
    lastPropContentRef.current = content;
    
    // Log for debugging
    logger.debug('Content prop changed, updating editor content');
    
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
          logger.debug('Error restoring cursor position:', e);
        }
      }
    } finally {
      // Always ensure we reset the updating flag
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 10);
    }
  }, [editor, internalContent, content]);

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

  // Removed toolbar hover handlers since toolbar is moved to parent component

  if (!editor) {
    return null;
  }

  return (
    <div 
      className={`prd-editor w-full ${className}`}
    >
      {/* Toolbar moved to PRDWorkbench.client.tsx */}
      
      {/* Editor content with proper styling */}
      <div className={`border rounded-md overflow-hidden relative ${readOnly ? 'border-transparent' : 'border-bolt-elements-borderColor'}`}>
        <EditorContent 
          editor={editor} 
          className={classNames(
            "prose dark:prose-invert max-w-none",
            styles.markdownPreview, // Always apply markdown preview styles
            "markdown-editor document-editor", // Apply both markdown and document editor classes
            modeTransition ? 'mode-transition' : '', // Add transition class when mode changes
            readOnly ? 'opacity-95' : '' // Subtle opacity change for read mode
          )}
        />
      </div>
    </div>
  );
};

// Export both the editor and toolbar
export { Editor }; // Re-export the Editor type
export default PRDTipTapEditor;
