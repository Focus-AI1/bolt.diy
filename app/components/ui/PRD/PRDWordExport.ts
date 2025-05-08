import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ImageRun, Header, Footer, ExternalHyperlink, PageBreak, UnderlineType } from 'docx';
import { createScopedLogger } from '~/utils/logger';
import type { PRDDocument } from './prdUtils';
import { cleanHtml } from './prdUtils';

const logger = createScopedLogger('PRDWordExport');

// Default styling options for consistent Word appearance
const WORD_STYLES = {
  fonts: {
    headings: 'Calibri',
    body: 'Calibri',
  },
  fontSize: {
    title: 28,
    heading1: 18,
    heading2: 16,
    heading3: 14,
    body: 11,
    footer: 9,
  },
  colors: {
    title: '2F5496',
    heading: '2F5496',
    body: '000000',
    hyperlink: '0563C1',
    muted: '5A5A5A',
  },
  spacing: {
    titleBefore: 400,
    titleAfter: 400,
    headingBefore: 300,
    headingAfter: 200,
    paragraphAfter: 200,
  }
};

/**
 * Converts HTML content to docx-compatible elements with enhanced formatting
 * 
 * @param htmlContent HTML content to convert
 * @returns Array of docx-compatible elements
 */
export const convertHtmlToDocxElements = (htmlContent: string): any[] => {
  if (!htmlContent) return [];
  
  const elements: any[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml(htmlContent), 'text/html');
  const nodes = Array.from(doc.body.childNodes);
  
  const processNode = (node: Node, level: number = 0): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        elements.push(new Paragraph({
          children: [new TextRun({
            text,
            size: WORD_STYLES.fontSize.body * 2, // Word sizes are in half-points
            font: WORD_STYLES.fonts.body
          })],
          spacing: { after: WORD_STYLES.spacing.paragraphAfter }
        }));
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    const hasChildren = element.hasChildNodes();
    
    // Extract inline styling information
    const isBold = window.getComputedStyle(element).fontWeight === 'bold' || 
                  element.style.fontWeight === 'bold' ||
                  tagName === 'strong' || 
                  tagName === 'b';
    const isItalic = window.getComputedStyle(element).fontStyle === 'italic' || 
                    element.style.fontStyle === 'italic' || 
                    tagName === 'em' || 
                    tagName === 'i';
    const isUnderlined = window.getComputedStyle(element).textDecoration.includes('underline') || 
                        element.style.textDecoration.includes('underline') ||
                        tagName === 'u';
    
    // Process by element type
    switch (tagName) {
      case 'h1':
        elements.push(new Paragraph({
          children: [new TextRun({
            text: element.textContent || '',
            bold: true,
            size: WORD_STYLES.fontSize.heading1 * 2,
            font: WORD_STYLES.fonts.headings,
            color: WORD_STYLES.colors.heading
          })],
          heading: HeadingLevel.HEADING_1,
          spacing: { 
            before: WORD_STYLES.spacing.headingBefore, 
            after: WORD_STYLES.spacing.headingAfter
          }
        }));
        break;
      case 'h2':
        elements.push(new Paragraph({
          children: [new TextRun({
            text: element.textContent || '',
            bold: true,
            size: WORD_STYLES.fontSize.heading2 * 2,
            font: WORD_STYLES.fonts.headings,
            color: WORD_STYLES.colors.heading
          })],
          heading: HeadingLevel.HEADING_2,
          spacing: { 
            before: WORD_STYLES.spacing.headingBefore, 
            after: WORD_STYLES.spacing.headingAfter
          }
        }));
        break;
      case 'h3':
        elements.push(new Paragraph({
          children: [new TextRun({
            text: element.textContent || '',
            bold: true,
            size: WORD_STYLES.fontSize.heading3 * 2,
            font: WORD_STYLES.fonts.headings,
            color: WORD_STYLES.colors.heading
          })],
          heading: HeadingLevel.HEADING_3,
          spacing: { 
            before: WORD_STYLES.spacing.headingBefore, 
            after: WORD_STYLES.spacing.headingAfter
          }
        }));
        break;
      case 'p':
        // Handle paragraphs with potentially mixed formatting
        if (hasComplexChildren(element)) {
          const runs = processFormattedText(element);
          elements.push(new Paragraph({
            children: runs,
            spacing: { after: WORD_STYLES.spacing.paragraphAfter }
          }));
        } else {
          elements.push(new Paragraph({
            children: [new TextRun({
              text: element.textContent || '',
              size: WORD_STYLES.fontSize.body * 2,
              font: WORD_STYLES.fonts.body,
              bold: isBold,
              italics: isItalic,
              underline: isUnderlined ? { type: UnderlineType.SINGLE } : undefined
            })],
            spacing: { after: WORD_STYLES.spacing.paragraphAfter }
          }));
        }
        break;
      case 'a':
        // Handle hyperlinks
        const url = element.getAttribute('href') || '';
        if (url) {
          const linkText = element.textContent || url;
          elements.push(new Paragraph({
            children: [
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: linkText,
                    style: "Hyperlink",
                    color: WORD_STYLES.colors.hyperlink,
                    underline: { type: UnderlineType.SINGLE }
                  })
                ],
                link: url
              })
            ],
            spacing: { after: WORD_STYLES.spacing.paragraphAfter }
          }));
        }
        break;
      case 'img':
        // Handle images (would require base64 implementation in production)
        // Note: This is a placeholder - in production you'd need to handle image fetching/conversion
        const altText = element.getAttribute('alt') || 'Image';
        elements.push(new Paragraph({
          children: [new TextRun({
            text: `[Image: ${altText}]`, 
            italics: true,
            color: WORD_STYLES.colors.muted
          })],
          spacing: { after: WORD_STYLES.spacing.paragraphAfter }
        }));
        break;
      case 'ul':
      case 'ol':
        processListItems(element, elements, level, tagName === 'ol');
        break;
      case 'table':
        processTable(element, elements);
        break;
      case 'blockquote':
        processBlockquote(element, elements);
        break;
      case 'hr':
        // Handle horizontal rules
        elements.push(new Paragraph({
          children: [],
          border: {
            bottom: { 
              color: "999999", 
              space: 1, 
              style: BorderStyle.SINGLE, 
              size: 6 
            },
          },
          spacing: { before: 200, after: 200 }
        }));
        break;
      case 'br':
        // Handle line breaks
        elements.push(new Paragraph({
          children: [new TextRun("")]
        }));
        break;
      case 'div':
      case 'section':
      case 'article':
      case 'aside':
      case 'header':
      case 'footer':
      case 'nav':
      case 'main':
      case 'figure':
      case 'figcaption':
        // Process container elements recursively
        Array.from(element.childNodes).forEach(child => {
          processNode(child, level);
        });
        break;
      default:
        // For other elements, process children recursively
        if (hasChildren) {
          Array.from(element.childNodes).forEach(child => {
            processNode(child, level + 1);
          });
        }
        break;
    }
  };
  
  // Helper function to process formatted text with mixed styles
  const processFormattedText = (element: HTMLElement): TextRun[] => {
    const runs: TextRun[] = [];
    
    // Process all child nodes to handle mixed formatting
    Array.from(element.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          runs.push(new TextRun({
            text,
            size: WORD_STYLES.fontSize.body * 2,
            font: WORD_STYLES.fonts.body
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const childElement = node as HTMLElement;
        const tagName = childElement.tagName.toLowerCase();
        const text = childElement.textContent?.trim();
        
        if (text) {
          const isBold = tagName === 'strong' || tagName === 'b' || 
                        window.getComputedStyle(childElement).fontWeight === 'bold' ||
                        childElement.style.fontWeight === 'bold';
          const isItalic = tagName === 'em' || tagName === 'i' || 
                          window.getComputedStyle(childElement).fontStyle === 'italic' ||
                          childElement.style.fontStyle === 'italic';
          const isUnderlined = tagName === 'u' || 
                              window.getComputedStyle(childElement).textDecoration.includes('underline') ||
                              childElement.style.textDecoration.includes('underline');
          
          if (tagName === 'a') {
            const url = childElement.getAttribute('href') || '';
            runs.push(new ExternalHyperlink({
              children: [
                new TextRun({
                  text,
                  color: WORD_STYLES.colors.hyperlink,
                  underline: { type: UnderlineType.SINGLE }
                })
              ],
              link: url
            }));
          } else {
            runs.push(new TextRun({
              text,
              bold: isBold,
              italics: isItalic,
              underline: isUnderlined ? { type: UnderlineType.SINGLE } : undefined,
              size: WORD_STYLES.fontSize.body * 2,
              font: WORD_STYLES.fonts.body
            }));
          }
        }
      }
    });
    
    return runs;
  };
  
  // Helper function to check if element has complex formatting children
  const hasComplexChildren = (element: HTMLElement): boolean => {
    for (let i = 0; i < element.childNodes.length; i++) {
      const node = element.childNodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = (node as HTMLElement).tagName.toLowerCase();
        if (['strong', 'b', 'em', 'i', 'u', 'a', 'span', 'code'].includes(tagName)) {
          return true;
        }
      }
    }
    return false;
  };
  
  // Helper function to process list items
  const processListItems = (element: HTMLElement, elements: any[], level: number, isOrdered: boolean): void => {
    Array.from(element.children).forEach((li, index) => {
      // Handle nested lists
      const nestedLists = Array.from(li.querySelectorAll('ul, ol'));
      
      // Process the list item text (excluding any nested list text)
      let itemText = li.textContent || '';
      nestedLists.forEach(nestedList => {
        itemText = itemText.replace(nestedList.textContent || '', '');
      });
      
      // Create the list item paragraph
      elements.push(new Paragraph({
        children: [
          new TextRun({
            text: `${isOrdered ? (index + 1) + '. ' : '• '}${itemText.trim()}`,
            size: WORD_STYLES.fontSize.body * 2,
            font: WORD_STYLES.fonts.body
          }),
        ],
        spacing: { before: 100, after: 100 },
        indent: { left: 720 * (level + 1), hanging: isOrdered ? 300 : 200 }
      }));
      
      // Process any nested lists
      nestedLists.forEach(nestedList => {
        processListItems(nestedList as HTMLElement, elements, level + 1, (nestedList as HTMLElement).tagName.toLowerCase() === 'ol');
      });
    });
  };
  
  // Helper function to process tables
  const processTable = (element: HTMLElement, elements: any[]): void => {
    const rows: TableRow[] = [];
    const tableElement = element as HTMLTableElement;
    const hasHeader = tableElement.querySelector('thead') !== null;
    
    // Process table rows
    Array.from(tableElement.querySelectorAll('tr')).forEach((tr, rowIndex) => {
      const cells: TableCell[] = [];
      const isHeaderRow = hasHeader && rowIndex === 0;
      
      // Process cells in this row
      Array.from(tr.querySelectorAll('th, td')).forEach(cell => {
        // Get the content of the cell
        const cellContent = cell.textContent?.trim() || '';
        
        // Calculate column width
        const colCount = tr.querySelectorAll('th, td').length;
        const width = { size: 100 / colCount, type: WidthType.PERCENTAGE };
        
        // Create cell with proper formatting
        cells.push(new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cellContent,
                  bold: isHeaderRow,
                  size: WORD_STYLES.fontSize.body * 2,
                  font: WORD_STYLES.fonts.body
                })
              ],
              alignment: AlignmentType.LEFT
            })
          ],
          width
        }));
      });
      
      if (cells.length > 0) {
        rows.push(new TableRow({ children: cells }));
      }
    });
    
    if (rows.length > 0) {
      elements.push(new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" }
        }
      }));
      
      // Add spacing after table
      elements.push(new Paragraph({
        children: [],
        spacing: { after: 200 }
      }));
    }
  };
  
  // Helper function to process blockquotes
  const processBlockquote = (element: HTMLElement, elements: any[]): void => {
    const text = element.textContent?.trim() || '';
    
    elements.push(new Paragraph({
      children: [
        new TextRun({
          text,
          italics: true,
          size: WORD_STYLES.fontSize.body * 2,
          font: WORD_STYLES.fonts.body,
          color: WORD_STYLES.colors.muted
        })
      ],
      indent: { left: 720 },
      border: {
        left: { style: BorderStyle.SINGLE, size: 3, color: "AAAAAA" },
      },
      spacing: { before: 200, after: 200 }
    }));
  };
  
  nodes.forEach(node => processNode(node));
  return elements;
};

/**
 * Creates a Word document from PRD content with basic formatting
 * 
 * @param editorContent HTML content from the editor
 * @param prdDocument PRD document metadata
 * @returns Promise that resolves to a Blob containing the Word document
 */
export const createSimpleWordDocument = async (
  editorContent: string,
  prdDocument?: PRDDocument | null
): Promise<Blob> => {
  try {
    logger.debug('Creating Word document');
    
    const title = prdDocument?.title || 'Product Requirements Document';
    
    // Create a document with simple formatting
    const doc = new Document({
      creator: "Focus AI PRD Generator",
      title: title,
      sections: [
        {
          children: [
            // Convert main content using the HTML-to-DOCX converter
            ...convertHtmlToDocxElements(editorContent),
          ]
        }
      ]
    });

    // Generate and return the Word document as a blob
    return await Packer.toBlob(doc);
  } catch (error) {
    logger.error('Error creating Word document:', error);
    throw new Error('Failed to create Word document');
  }
};

/**
 * Exports the PRD content as a Microsoft Word document
 * This function uses a streamlined document generation approach for improved reliability
 * 
 * @param editorContent HTML content from the editor
 * @param prdDocument PRD document metadata
 */
export const exportToWord = async (
  editorContent: string,
  prdDocument?: PRDDocument | null
): Promise<void> => {
  try {
    // Check if the content is excessively large (over 1MB when stringified)
    if (editorContent.length > 1000000) {
      logger.warn('Document content is very large, this may cause issues with Word export');
    }
    
    // Generate the Word document
    const docBlob = await createSimpleWordDocument(editorContent, prdDocument);
    
    // Generate a filename based on the document title
    const title = prdDocument?.title || 'prd';
    const filename = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.docx`;
    
    // Create a download link and trigger the download
    const url = URL.createObjectURL(docBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logger.debug('Word document download initiated');
  } catch (error) {
    logger.error('Error exporting to Word:', error);
    throw new Error('Failed to export as Word document');
  }
};
