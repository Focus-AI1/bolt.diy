import { createScopedLogger } from '~/utils/logger';
import type { PRDDocument } from './prdUtils';
import { cleanHtml } from './prdUtils';

const logger = createScopedLogger('PRDHtmlExport');

/**
 * Exports the PRD content as an HTML document
 * 
 * @param editorHtml HTML content from the editor
 * @param prdDocument PRD document metadata
 */
export const exportToHtml = (
  editorHtml: string,
  prdDocument?: PRDDocument | null
): void => {
  try {
    if (!editorHtml) {
      throw new Error("No HTML content available for export.");
    }
    
    const cleanedContent = cleanHtml(editorHtml);
    const title = prdDocument?.title || 'PRD';
    const lastUpdated = prdDocument?.lastUpdated ? new Date(prdDocument.lastUpdated).toLocaleString() : 'N/A';

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>${title}</title>
 <style> body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 20px auto; padding: 15px; } h1, h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; } /* Add more basic styles if needed */ </style>
</head>
<body>
 ${cleanedContent}
 <hr>
 <p style="font-size: 0.8em; color: #777;">Last updated: ${lastUpdated}</p>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logger.debug('HTML document download initiated');
  } catch (error) {
    logger.error('Error exporting to HTML:', error);
    throw new Error('Failed to export as HTML document');
  }
};
