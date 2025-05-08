import { createScopedLogger } from '~/utils/logger';
import type { PRDDocument } from './prdUtils';

const logger = createScopedLogger('PRDMarkdownExport');

/**
 * Exports the PRD content as a Markdown document
 * 
 * @param editorContent Markdown content from the editor
 * @param prdDocument PRD document metadata
 */
export const exportToMarkdown = (
  editorContent: string,
  prdDocument?: PRDDocument | null
): void => {
  try {
    if (!prdDocument && !editorContent) {
      throw new Error("No PRD loaded or content available.");
    }
    
    const titleForFilename = prdDocument?.title || 'prd';
    const blob = new Blob([editorContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titleForFilename.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logger.debug('Markdown document download initiated');
  } catch (error) {
    logger.error('Error exporting to Markdown:', error);
    throw new Error('Failed to export as Markdown document');
  }
};
