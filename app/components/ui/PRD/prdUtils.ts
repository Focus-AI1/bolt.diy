import { createScopedLogger } from '~/utils/logger';
import type { Message } from 'ai';

const logger = createScopedLogger('prdUtils');

// PRD document interfaces (can be shared or defined here if not already shared)
export interface PRDSection {
  id: string;
  title: string;
  content: string; // Expecting HTML content here
}

export interface PRDDocument {
  title: string;
  description: string; // Expecting HTML content here
  sections: PRDSection[];
  lastUpdated: string;
  _source?: string; // Added to identify the source of updates (e.g., "chat_update")
}

// Helper function to clean streaming markdown content
export const cleanStreamingContent = (content: string): string => {
    if (!content) return '';

    const lines = content.split('\n');
    const cleanedLines: string[] = [];
    let inValidSection = false;
    let validSectionCount = 0;

    // Comprehensive patterns for placeholder detection
    // Using a more structured approach with named pattern groups for maintainability
    const placeholderPatterns = {
        // Common placeholder keywords (case-insensitive)
        keywords: ['remain', 'unchanged', 'continue', 'same', 'skip', 'omit', 'exactly', 'identical', 'previous', 'before', 'as is'],
        
        // Document-related context words that often appear with placeholder keywords
        contextWords: ['section', 'content', 'prd', 'document', 'text', 'part', 'above', 'below'],
        
        // Specific complete phrases that indicate placeholder content
        specificPhrases: [
            "rest of the document remains unchanged",
            "rest of the prd remains exactly the same",
            "previous content continues unchanged",
            "document continues as before",
            "content remains identical",
            "rest of the sections continue as before",
            "unchanged from previous version",
            "other sections remain the same",
            "previous sections continue exactly as before",
            "rest of the document continues exactly as before",
            "as previously described",
            "continues as above",
            "no changes to this section"
        ],
        
        // Regex patterns for bracketed placeholder text with various formats
        // Using case-insensitive flag for better matching
        bracketPatterns: [
            // General ellipsis in brackets
            /\[.*?\.{3}\]/i,
            
            // Specific patterns with keywords
            /\[.*?\b(unchanged|same|remain|continue|skip|omit)\b.*?\]/i,
            
            // Document/PRD specific patterns
            /\[\s*rest of.*?\]/i,
            /\[\s*(document|prd|content|section).*?\b(remain|unchanged|continue|same)\b.*?\]/i,
            /\[\s*\b(unchanged|same)\b.*?(document|prd|content|section).*?\]/i,
            
            // Patterns with "exactly the same" phrasing
            /\[.*?\bexactly the same\b.*?\]/i,
            
            // Patterns that indicate something is continuing
            /\[.*?\bcontinues?\b.*?\]/i,
            
            // Patterns that explicitly mention previous/existing content
            /\[.*?\b(previous|existing)\b.*?\b(content|text|section)\b.*?\]/i,
            
            // Additional patterns to catch more variations
            /\[.*?\b(as before|as above|as earlier|as previously)\b.*?\]/i,
            /\[.*?\b(no change|no update|no modification)\b.*?\]/i
        ]
    };

    /**
     * Determines if text is likely a placeholder indicating unchanged content
     * Uses multiple detection strategies for high accuracy while avoiding false positives
     */
    const isPlaceholderText = (text: string): boolean => {
        // Skip empty text
        if (!text.trim()) return false;
        
        // Convert to lowercase for case-insensitive matching
        const lowerText = text.toLowerCase();
        
        // 1. Check against bracket patterns (highest confidence)
        if (placeholderPatterns.bracketPatterns.some(pattern => pattern.test(text))) {
            return true;
        }
        
        // 2. Check for specific complete phrases (high confidence)
        if (placeholderPatterns.specificPhrases.some(phrase => 
            lowerText.includes(phrase.toLowerCase()))) {
            return true;
        }
        
        // 3. Check for keyword + context combinations (medium confidence)
        // This is more prone to false positives, so we use additional heuristics
        const hasPlaceholderKeyword = placeholderPatterns.keywords.some(keyword => 
            lowerText.includes(keyword));
            
        if (hasPlaceholderKeyword) {
            // Only consider it a placeholder if it appears with contextual words
            // or has structural indicators like brackets or ellipsis
            const hasContextWord = placeholderPatterns.contextWords.some(word => 
                lowerText.includes(word));
                
            const hasStructuralIndicator = 
                lowerText.includes('[') || 
                lowerText.includes(']') || 
                lowerText.includes('...') ||
                lowerText.includes('…');  // Unicode ellipsis
                
            // Additional check for phrases like "remains unchanged" or "continues as before"
            const hasCommonPhrase = 
                /\bremains?\s+unchanged\b/i.test(text) || 
                /\bcontinues?\s+as\s+before\b/i.test(text) ||
                /\bstays?\s+the\s+same\b/i.test(text) ||
                /\bas\s+(?:before|above|earlier|previously)\b/i.test(text);
            
            // NARRATIVE PROTECTION: Don't flag text with sentences about people or personas
            const containsNarrativeIndicators = 
                /\b(?:named|customer|user|visit|person|company|compan(?:y|ies)|launch|implement|integrat|appreciat|present|enable|disable|feature)\b/i.test(text) ||
                /\b(?:minute|second|compared|typical|receive|proper|option|process|approach)\b/i.test(text);
                
            // If text has narrative indicators, don't mark as placeholder regardless of other factors
            if (containsNarrativeIndicators) {
                return false;
            }
                
            return (hasContextWord && hasPlaceholderKeyword) || 
                   (hasStructuralIndicator && hasPlaceholderKeyword) ||
                   hasCommonPhrase;
        }
        
        return false;
    };

    // Process each line with careful consideration for document structure
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Handle empty lines - preserve them only in valid sections
        if (!trimmedLine) {
            if (inValidSection) cleanedLines.push('');
            continue;
        }

        // Filter out placeholder text
        if (isPlaceholderText(trimmedLine)) {
            // Skip this line as it's a placeholder
            continue;
        }

        // Handle section headers
        if (trimmedLine.startsWith('# ') || trimmedLine.startsWith('## ')) {
            // Skip headers that are just numbers (often incomplete)
            if (/^#+\s+\d+\.?\s*$/.test(trimmedLine)) continue;
            
            // Only include headers with actual content
            if (trimmedLine.length > 3) {
                inValidSection = true;
                validSectionCount++;
                cleanedLines.push(line);
            }
            continue;
        }

        // Skip standalone numbers (often incomplete or list markers)
        if (/^\s*\d+\.?\s*$/.test(trimmedLine)) continue;

        // Include all other non-empty content
        if (trimmedLine.length > 0) {
            cleanedLines.push(line);
        }
    }

    // Avoid displaying garbage if only remnants were found
    // This maintains the existing behavior while ensuring document quality
    if (validSectionCount === 0 && cleanedLines.length < 5) {
        return '';
    }

    return cleanedLines.join('\n');
};

// Parse markdown content to PRD document structure for PRDWorkbench.client.tsx
// Note: This assumes input markdown follows a specific structure (# Title, ## Section)
// and expects the output content/description to be raw text/markdown,
// which might need further processing if HTML is desired in the PRDDocument.
export const parseEditablePRDMarkdown = (markdown: string, existingDoc: PRDDocument | null): PRDDocument => {
    const updatedDoc: PRDDocument = existingDoc
        ? { ...existingDoc, sections: [...existingDoc.sections], lastUpdated: new Date().toISOString() }
        : { title: 'New PRD', description: '', sections: [], lastUpdated: new Date().toISOString() };

    try {
        const lines = markdown.split('\n');
        let currentTitle = '';
        let currentContent = '';
        let descriptionContent = '';
        let state: 'title' | 'description' | 'section' = 'title';
        const sections: PRDSection[] = [];

        // Map existing sections by title for ID preservation
        const existingSectionsMap = new Map<string, PRDSection>();
        updatedDoc.sections.forEach(s => existingSectionsMap.set(s.title.toLowerCase(), s));
        const processedTitles = new Set<string>(); // Track titles processed in this parse

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('# ') && state === 'title') {
                updatedDoc.title = trimmedLine.substring(2).trim();
                state = 'description';
                continue;
            }

            if (trimmedLine.startsWith('## ')) {
                // Save previous section/description
                if (state === 'section' && currentTitle) {
                    const titleLower = currentTitle.toLowerCase();
                    const existing = existingSectionsMap.get(titleLower);
                    sections.push({
                        id: existing?.id || `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                        title: currentTitle,
                        content: currentContent.trim()
                    });
                    processedTitles.add(titleLower);
                } else if (state === 'description') {
                    updatedDoc.description = descriptionContent.trim();
                }

                // Start new section
                state = 'section';
                currentTitle = trimmedLine.substring(3).trim();
                currentContent = '';

                // Skip titles that are just numbers
                if (/^#+\s+\d+\.?\s*$/.test(currentTitle)) {
                     currentTitle = ''; // Reset title if invalid
                     state = 'description'; // Revert state if title was skipped
                     continue;
                 }

            } else if (state === 'description') {
                descriptionContent += line + '\n';
            } else if (state === 'section' && currentTitle) {
                currentContent += line + '\n';
            }
        }

        // Save the last section
        if (state === 'section' && currentTitle) {
             const titleLower = currentTitle.toLowerCase();
             const existing = existingSectionsMap.get(titleLower);
             sections.push({
                 id: existing?.id || `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                 title: currentTitle,
                 content: currentContent.trim()
             });
             processedTitles.add(titleLower);
        } else if (state === 'description' && !updatedDoc.description) {
            // If we finished in description state and description is empty, use the content
            updatedDoc.description = descriptionContent.trim();
        }

        // Filter out empty/invalid sections and preserve unprocessed existing sections
        const finalSections: PRDSection[] = sections.filter(s => s.title && s.content && !/^\d+\.?\s*$/.test(s.title));

        // Add back any existing sections that weren't updated/processed if they have content
        existingSectionsMap.forEach((section, titleLower) => {
            if (!processedTitles.has(titleLower) && section.content?.trim()) {
                finalSections.push(section);
            }
        });


        // Basic filtering for final sections
        updatedDoc.sections = finalSections.filter(section => {
             const isTitleJustNumber = /^\d+\.?\s*$/.test(section.title.trim());
             const hasContent = section.content.trim().length > 0;
             const isContentJustNumbers = /^[\d\.\s]+$/.test(section.content.trim());
             return !isTitleJustNumber && hasContent && !isContentJustNumbers;
         });


        return updatedDoc;
    } catch (error) {
        logger.error('Error parsing markdown to PRD:', error);
        return updatedDoc; // Return partially updated or existing doc on error
    }
};


// Generate combined HTML content for display/export (assumes PRDDocument contains HTML)
export const generateFullHtml = (doc: PRDDocument | null): string => {
    if (!doc) return '';
    try {
        let html = '';
        html += `<h1 class="enhanced-heading level-1">${doc.title || 'Untitled PRD'}</h1>\n\n`;
        if (doc.description) {
            // Assume description is already HTML or simple text needing paragraph tags
            html += doc.description.startsWith('<') ? doc.description : `<p class="enhanced-paragraph">${doc.description}</p>`;
            html += `\n\n`;
        }
        doc.sections.forEach(section => {
            if (!section.title) return; // Skip sections without title
            html += `<h2 class="enhanced-heading level-2">${section.title}</h2>\n\n`;
            if (section.content) {
                 // Assume content is already HTML or simple text needing paragraph tags
                 html += section.content.startsWith('<') ? section.content : `<p class="enhanced-paragraph">${section.content}</p>`;
                 html += `\n\n`;
            }
        });
        return html;
    } catch (error) {
        logger.error('Error generating HTML:', error);
        return '';
    }
};

// Generate combined Markdown content from PRDDocument (strips HTML)
export const generateFullMarkdown = (doc: PRDDocument | null): string => {
    if (!doc) return '';
    try {
        let markdown = '';
        markdown += `# ${doc.title || 'Untitled PRD'}\n\n`;
        if (doc.description) {
            // Preserve line breaks and formatting in description
            const descriptionText = doc.description
                .replace(/<br\s*\/?>/gi, '\n') // Convert <br> tags to newlines
                .replace(/<p>(.*?)<\/p>/gi, '$1\n\n') // Convert paragraphs to double newlines
                .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
                .trim();
            markdown += `${descriptionText}\n\n`;
        }
        doc.sections.forEach(section => {
            if (!section.title) return; // Skip sections without title
            markdown += `## ${section.title}\n\n`;
            if (section.content) {
                // Preserve line breaks and formatting in section content
                let contentText = section.content
                    .replace(/<br\s*\/?>/gi, '\n') // Convert <br> tags to newlines
                    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n') // Convert paragraphs to double newlines
                    .replace(/<li>(.*?)<\/li>/gi, '- $1\n') // Convert list items to markdown list items
                    .replace(/<ul>|<\/ul>|<ol>|<\/ol>/gi, '') // Remove list container tags
                    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n') // Convert h3 to markdown h3
                    .replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n') // Convert h4 to markdown h4
                    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**') // Convert strong to bold
                    .replace(/<em>(.*?)<\/em>/gi, '*$1*') // Convert em to italic
                    .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
                    .trim();
                
                // Remove any placeholder text that might have been preserved in the document structure
                contentText = removePlaceholderText(contentText);
                
                // Ensure there's content to add
                if (contentText.trim()) {
                    markdown += `${contentText}\n\n`;
                }
            }
        });
        return markdown;
    } catch (error) {
        logger.error('Error generating markdown:', error);
        return '';
    }
};

/**
 * Helper function to remove placeholder text from content
 * This ensures no placeholder text appears in the final output
 */
const removePlaceholderText = (content: string): string => {
    if (!content) return '';
    
    // Split content into lines for processing
    const lines = content.split('\n');
    const cleanedLines = lines.filter(line => {
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) return true;
        
        // Check for narrative indicators that should be preserved
        const containsNarrativeIndicators = 
            /\b(?:named|customer|user|visit|person|company|compan(?:y|ies)|launch|implement|integrat|appreciat|present|enable|disable|feature)\b/i.test(trimmedLine) ||
            /\b(?:minute|second|compared|typical|receive|proper|option|process|approach)\b/i.test(trimmedLine);
            
        // Always preserve narrative content
        if (containsNarrativeIndicators) {
            return true;
        }
        
        // Comprehensive check for placeholder text
        // Match patterns like "[Previous sections continue unchanged...]", "...content remains the same...", etc.
        const placeholderPatterns = [
            /\[\s*(?:previous|rest of|other|unchanged|remaining|existing).*?(?:section|content|document|prd).*?(?:continue|remain|same|before|identical|exact).*?\]/i,
            /\[\s*(?:section|content|document|prd).*?(?:unchanged|continue|remain|same|before|identical|exact).*?\]/i,
            /\[\s*\.{3,}\s*\]/i,
            /\[.*?\b(continue|remain|same|unchanged|before|identical|exact).*?\]/i,
            /\[.*?\b(skip|omit).*?\]/i,
            /\[.*?\b(no change|no update|no modification).*?\]/i,
            /\[.*?\b(as before|as above|as earlier|as previously).*?\]/i
        ];
        
        // Return false (filter out) if any pattern matches
        return !placeholderPatterns.some(pattern => pattern.test(trimmedLine));
    });
    
    return cleanedLines.join('\n');
};

// Helper function to clean markdown content of template string leakage
export const cleanMarkdownFromTemplateLeakage = (markdown: string): string => {
    if (!markdown) return '';
    
    try {
        // First, remove lines containing template string patterns
        let cleaned = markdown
            .split('\n')
            .filter(line => {
                // Filter out lines with template string leakage
                return !(
                    line.includes('${attributes.level}') ||
                    line.includes('return {') ||
                    line.includes('class:') ||
                    line.match(/enhanced-heading level-\$\{/) ||
                    line.match(/^return \{/) ||
                    line.match(/^\s*\}\;$/)
                );
            })
            .join('\n');
        
        // STEP 1: Fix section headings with appended content
        cleaned = fixSectionHeadings(cleaned);
        
        // STEP 2: Handle repetitive bullet points and list items
        cleaned = cleanRepetitiveListItems(cleaned);
        
        // STEP 3: Handle repetitive paragraphs and sections
        cleaned = cleanRepetitiveParagraphs(cleaned);
        
        return cleaned;
        
    } catch (error) {
        // Log error but don't crash - return the original content with basic cleanup
        logger.error('Error in cleanMarkdownFromTemplateLeakage:', error);
        
        // Fallback to basic cleanup if advanced cleaning fails
        return markdown
            .split('\n')
            .filter(line => !line.includes('${') && !line.includes('return {'))
            .join('\n');
    }
};

/**
 * Fixes section headings that have content directly appended to them
 * @param content Markdown content to fix
 * @returns Content with properly formatted section headings
 */
function fixSectionHeadings(content: string): string {
    // Split the content into lines for analysis
    const lines = content.split('\n');
    const result: string[] = [];
    
    // Regex to identify numbered headings (e.g., "1. Heading Title")
    const headingRegex = /^(\d+\.\s+)([A-Z][a-zA-Z0-9\s]+)(.*)$/;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headingMatch = line.match(headingRegex);
        
        if (headingMatch) {
            const [, numberPrefix, headingText, remainingText] = headingMatch;
            
            // Check if there's content directly appended to the heading
            if (remainingText && remainingText.trim()) {
                // Analyze the remaining text to determine if it should be separated
                const shouldSeparate = detectAppendedContent(headingText, remainingText);
                
                if (shouldSeparate) {
                    // Add the heading by itself
                    result.push(`${numberPrefix}${headingText}`);
                    
                    // Add a blank line for proper markdown formatting
                    result.push('');
                    
                    // Add the content as a separate paragraph
                    result.push(remainingText.trim());
                    continue;
                }
            }
        }
        
        // If no special handling needed, keep the line as is
        result.push(line);
    }
    
    return result.join('\n');
}

/**
 * Intelligently detects if text appended to a heading should be separated
 * @param heading The heading text
 * @param appended The text appended to the heading
 * @returns True if the appended text should be separated from the heading
 */
function detectAppendedContent(heading: string, appended: string): boolean {
    // Clean the inputs
    heading = heading.trim();
    appended = appended.trim();
    
    if (!appended) return false;
    
    // Case 1: Appended text starts with a capital letter (likely a new sentence/concept)
    if (/^[A-Z]/.test(appended)) {
        return true;
    }
    
    // Case 2: Heading ends with a complete word and appended text starts with a complete word
    // This indicates they're likely separate concepts
    const lastHeadingChar = heading.charAt(heading.length - 1);
    const firstAppendedChar = appended.charAt(0);
    
    if (/[a-zA-Z]/.test(lastHeadingChar) && /[a-zA-Z]/.test(firstAppendedChar)) {
        // Check if there's a natural word break between them
        // Natural word breaks include spaces, punctuation, or case changes
        
        // Check for camelCase or PascalCase transition (lowercase to uppercase)
        if (/[a-z]$/.test(heading) && /^[A-Z]/.test(appended)) {
            return true;
        }
        
        // Check for clear semantic separation
        // If appended text forms a complete phrase/sentence, it's likely separate
        if (appended.split(' ').length >= 3) {
            return true;
        }
        
        // Check for common connecting words that might indicate a continuation
        const continuationWords = ['and', 'or', 'with', 'for', 'to', 'by', 'in', 'on', 'at'];
        const firstAppendedWord = appended.split(' ')[0].toLowerCase();
        
        if (!continuationWords.includes(firstAppendedWord)) {
            return true;
        }
    }
    
    // Case 3: Check for semantic differences using length and structure
    // If heading is short (like a title) and appended text is long (like a description)
    if (heading.split(' ').length <= 4 && appended.split(' ').length >= 5) {
        return true;
    }
    
    return false;
}

/**
 * Cleans repetitive list items in markdown content
 * @param content Markdown content to clean
 * @returns Cleaned content
 */
function cleanRepetitiveListItems(content: string): string {
    // First, handle repetitive list items by detecting and removing duplicates
    const listItemRegex = /^(\s*(?:-|\*|\+|\d+\.)\s+.+)$/gm;
    const listItems = new Map<string, number>();
    
    // Count occurrences of each list item
    let match;
    while ((match = listItemRegex.exec(content)) !== null) {
        const item = match[1].trim();
        listItems.set(item, (listItems.get(item) || 0) + 1);
    }
    
    // Replace items that appear more than once with a single occurrence
    for (const [item, count] of listItems.entries()) {
        if (count > 1) {
            // Create a regex that matches this exact item multiple times
            const escapedItem = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const duplicateRegex = new RegExp(`(${escapedItem}\\n)${escapedItem}(\\n${escapedItem})*`, 'g');
            content = content.replace(duplicateRegex, '$1');
        }
    }
    
    // Clean nested list items that are duplicated in parent items
    content = cleanNestedListDuplication(content);
    
    // Then, fix ordered list numbering
    return fixOrderedListNumbering(content);
}

/**
 * Cleans cases where bullet points are duplicated within their parent numbered list items
 * @param content Markdown content to clean
 * @returns Cleaned content without duplicated nested lists
 */
function cleanNestedListDuplication(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i];
        
        // Check if this is a numbered list item that might contain duplicated bullet points
        const numberedItemMatch = currentLine.match(/^(\s*)(\d+\.)\s+(.+)$/);
        
        if (numberedItemMatch) {
            const [, indent, marker, text] = numberedItemMatch;
            
            // Check if the text contains bullet points that might be duplicated in subsequent lines
            const bulletPointsInText = text.match(/(?:[-*+]\s+[^-*+]+)+/g);
            
            if (bulletPointsInText) {
                // Add the numbered item without the bullet points
                const cleanedText = text.replace(/(?:[-*+]\s+[^-*+]+)+/g, '').trim();
                result.push(`${indent}${marker} ${cleanedText}`);
                
                // Look ahead to see if the next lines are bullet points with the same content
                let j = i + 1;
                const nestedIndent = indent + '  '; // Expected indentation for nested items
                
                // Skip adding duplicated bullet points that already appear in the parent
                while (j < lines.length) {
                    const nextLine = lines[j];
                    const bulletMatch = nextLine.match(/^(\s*)([-*+])\s+(.+)$/);
                    
                    if (bulletMatch && bulletMatch[1].length > indent.length) {
                        // This is a nested bullet point
                        const bulletText = bulletMatch[3].trim();
                        
                        // Check if this bullet point is duplicated in the parent text
                        let isDuplicated = false;
                        for (const bp of bulletPointsInText || []) {
                            if (bp.includes(bulletText)) {
                                isDuplicated = true;
                                break;
                            }
                        }
                        
                        if (!isDuplicated) {
                            // Not duplicated, add it to the result
                            result.push(nextLine);
                        }
                        j++;
                    } else {
                        // Not a nested bullet point or indentation doesn't match, stop looking
                        break;
                    }
                }
                
                // Skip the lines we've processed
                i = j - 1;
            } else {
                // No bullet points in the text, add the line as is
                result.push(currentLine);
            }
        } else {
            // Not a numbered list item, add the line as is
            result.push(currentLine);
        }
    }
    
    return result.join('\n');
}

/**
 * Fixes ordered list numbering in markdown content
 * @param content Markdown content to fix
 * @returns Content with corrected list numbering
 */
function fixOrderedListNumbering(content: string): string {
    // Split content into lines for processing
    const lines = content.split('\n');
    const result: string[] = [];
    
    // Track list contexts at different indentation levels
    const listCounters: Map<number, number> = new Map();
    const listTypes: Map<number, 'ordered' | 'unordered'> = new Map();
    let lastOrderedListLevel: number | null = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this line is a list item
        const listMatch = line.match(/^(\s*)(\d+\.|[-*+])\s+(.+)$/);
        
        if (listMatch) {
            const [, indent, marker, text] = listMatch;
            const indentLevel = indent.length;
            const isOrdered = marker.includes('.');
            
            // Handle ordered lists
            if (isOrdered) {
                // Determine if this is a new list or continuing an existing one
                const isNewList = !listTypes.has(indentLevel) || 
                    (i > 0 && !lines[i-1].trim().match(/^\s*(\d+\.|[-*+])\s+/)) ||
                    (listTypes.get(indentLevel) !== 'ordered');
                
                if (isNewList) {
                    // Start a new ordered list
                    listTypes.set(indentLevel, 'ordered');
                    listCounters.set(indentLevel, 1);
                    lastOrderedListLevel = indentLevel;
                } else {
                    // Continue existing ordered list
                    listCounters.set(indentLevel, (listCounters.get(indentLevel) || 0) + 1);
                    lastOrderedListLevel = indentLevel;
                }
                
                // Reset counters for deeper indentation levels
                for (const [level] of listCounters.entries()) {
                    if (level > indentLevel) {
                        listCounters.delete(level);
                        listTypes.delete(level);
                    }
                }
                
                // Rebuild with correct numbering
                const counter = listCounters.get(indentLevel) || 1;
                result.push(`${indent}${counter}. ${text}`);
            } 
            // Handle unordered lists
            else {
                // For unordered lists, check if we're inside an ordered list
                if (lastOrderedListLevel !== null && indentLevel > lastOrderedListLevel) {
                    // This is a nested bullet under an ordered item
                    listTypes.set(indentLevel, 'unordered');
                    result.push(line); // Keep as is
                } else {
                    // This is a top-level bullet or a bullet after the ordered list ended
                    lastOrderedListLevel = null;
                    
                    // Start a new unordered list at this level
                    listTypes.set(indentLevel, 'unordered');
                    
                    // Reset counters for this and deeper levels
                    for (const [level] of listCounters.entries()) {
                        if (level >= indentLevel) {
                            listCounters.delete(level);
                            if (level > indentLevel) {
                                listTypes.delete(level);
                            }
                        }
                    }
                    
                    result.push(line); // Keep unordered list items as is
                }
            }
        } else {
            // Not a list item - check if it's a blank line
            if (!line.trim()) {
                // If we encounter a blank line, check if the next line is still part of the list
                const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
                const nextIsListItem = nextLine.match(/^\s*(\d+\.|[-*+])\s+/);
                
                // If next line isn't a list item, reset all list tracking
                if (!nextIsListItem) {
                    listCounters.clear();
                    listTypes.clear();
                    lastOrderedListLevel = null;
                }
            }
            
            result.push(line);
        }
    }
    
    return result.join('\n');
}

/**
 * Cleans repetitive paragraphs in markdown content
 * @param content Markdown content to clean
 * @returns Cleaned content
 */
function cleanRepetitiveParagraphs(content: string): string {
    // First handle exact repetitions (3+ times) of medium-sized chunks (10-100 chars)
    // This catches the most obvious repetitions
    const exactRepetitionRegex = /(.{10,100})(\1){2,}/g;
    content = content.replace(exactRepetitionRegex, '$1');
    
    // Then handle near-repetitions by splitting into paragraphs
    const paragraphs = content.split(/\n\s*\n/);
    const uniqueParagraphs: string[] = [];
    const seenParagraphs = new Set<string>();
    
    for (const paragraph of paragraphs) {
        // Skip empty paragraphs
        if (!paragraph.trim()) continue;
        
        // Normalize paragraph for comparison (lowercase, remove extra whitespace)
        const normalizedPara = paragraph.toLowerCase().replace(/\s+/g, ' ').trim();
        
        // If we haven't seen this paragraph before, add it
        if (!seenParagraphs.has(normalizedPara)) {
            uniqueParagraphs.push(paragraph);
            seenParagraphs.add(normalizedPara);
        }
    }
    
    return uniqueParagraphs.join('\n\n');
}

// Function to parse HTML content (likely from editor) back into PRDDocument structure
export const parseHtmlToPrd = (html: string, existingDoc: PRDDocument): PRDDocument => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div id="prd-root">${html}</div>`, 'text/html');
        const rootDiv = doc.getElementById('prd-root');

        if (!rootDiv) {
            logger.error('Failed to parse HTML: root element not found');
            return existingDoc;
        }

        const result: PRDDocument = {
            title: existingDoc.title,
            description: '', // Reset description, parse from HTML
            sections: [],
            lastUpdated: new Date().toISOString(),
        };

        // Extract title (first h1)
        const titleElem = rootDiv.querySelector('h1.enhanced-heading.level-1');
        if (titleElem?.textContent) {
            result.title = titleElem.textContent.trim();
        }

        // Extract description (content between h1 and first h2)
        let descriptionContent = '';
        let currentElem = titleElem?.nextElementSibling;
        while (currentElem && currentElem.tagName !== 'H2') {
             // Exclude empty paragraphs or divs that might just be spacing
            if (currentElem.textContent?.trim() || currentElem.innerHTML.includes('<img')) {
                 descriptionContent += currentElem.outerHTML;
             }
            currentElem = currentElem.nextElementSibling;
        }
        result.description = descriptionContent.trim();


        // Extract sections (h2 and content until next h2)
        const sections: PRDSection[] = [];
        const h2Elements = rootDiv.querySelectorAll('h2.enhanced-heading.level-2');

        const existingSectionsByTitle = new Map<string, PRDSection>();
        existingDoc.sections.forEach(section => {
            existingSectionsByTitle.set(section.title.toLowerCase(), section);
        });
        const processedTitles = new Set<string>();

        h2Elements.forEach((h2Elem) => {
            const sectionTitle = h2Elem.textContent?.trim();
            if (!sectionTitle || /^\d+\.?\s*$/.test(sectionTitle)) return; // Skip empty or numbered headings

            let sectionContent = '';
            let currentNode = h2Elem.nextElementSibling;

            while (currentNode && currentNode.tagName !== 'H2') {
                 // Exclude empty paragraphs or divs that might just be spacing
                 if (currentNode.textContent?.trim() || currentNode.innerHTML.includes('<img')) {
                     sectionContent += currentNode.outerHTML;
                 }
                currentNode = currentNode.nextElementSibling;
            }

            const titleLower = sectionTitle.toLowerCase();
            const existingSection = existingSectionsByTitle.get(titleLower);
            const sectionId = existingSection ? existingSection.id : `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            sections.push({
                id: sectionId,
                title: sectionTitle,
                content: sectionContent.trim()
            });
            processedTitles.add(titleLower);
        });

        // Add back any existing sections that weren't in the parsed HTML if they have content
        existingSectionsByTitle.forEach((section, titleLower) => {
            if (!processedTitles.has(titleLower) && section.content?.trim()) {
                 logger.info(`Preserving section not found in HTML: ${section.title}`);
                 sections.push(section);
            }
        });

        // Filter final sections
        result.sections = sections.filter(section => {
            const isTitleJustNumber = /^\d+\.?\s*$/.test(section.title.trim());
            const hasContent = section.content.trim().length > 0;
             // Check for content that's just numbers/dots/spaces
            const isContentJustNumbers = /^[\d\.\s]+$/.test(section.content.trim());
            return !isTitleJustNumber && hasContent && !isContentJustNumbers;
        });


        return result;
    } catch (error) {
        logger.error('Error parsing HTML to PRD:', error);
        return existingDoc; // Return existing document if parsing fails
    }
};

// Helper function to clean HTML of remnants and empty sections before saving
export const cleanHtml = (html: string): string => {
    try {
        const parser = new DOMParser();
        // Use body directly as root to avoid potential issues with self-closing tags in head
        const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
        const body = doc.body;

        // Remove empty headings or headings with just numbers/periods
        body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
            const headingText = heading.textContent?.trim() || '';
            if (!headingText || /^\d+\.?\s*$/.test(headingText)) {
                heading.remove();
            }
            
            // Clean up any template string leakage in heading classes
            if (heading.className && heading.className.includes('${attributes.level}')) {
                heading.className = 'enhanced-heading';
            }
        });

        // Remove empty paragraphs or paragraphs with just numbers/periods/spaces
        body.querySelectorAll('p').forEach(p => {
             const content = p.textContent?.trim() || '';
             // Remove paragraph if it's empty or contains only numbers/dots/spaces
             // Keep paragraphs that contain other elements like <img> even if text is empty
             if (!p.children.length && (!content || /^[\d\.\s]+$/.test(content))) {
                 p.remove();
             }
         });

         // Remove elements that might be placeholders or remnants (basic check)
         // Caution: This could remove valid content if it matches these patterns
         const placeholderTexts = [
             '[Previous sections continue unchanged...]',
             '[section unchanged]',
             '[unchanged content]',
             'return {',
             'class:',
             'enhanced-heading level-${attributes.level}'
         ];
         body.querySelectorAll('*').forEach(el => {
             const content = el.textContent?.trim() || '';
             
             // Check for template string leakage patterns
             if (content.includes('${attributes.level}') || 
                 content.includes('return {') || 
                 content.match(/enhanced-heading level-\$\{/)) {
                 el.remove();
             }
             
             // Check for other placeholder patterns
             if (placeholderTexts.some(placeholder => content.includes(placeholder))) {
                // More conservative removal: only remove if the element *only* contains the placeholder
                 if (placeholderTexts.includes(content)) {
                     el.remove();
                 }
             }
         });

        return body.innerHTML;
    } catch (error) {
        logger.error('Error cleaning HTML:', error);
        return html; // Return original if cleaning fails
    }
};

// Helper function to sort sections by numerical prefix
export const sortSectionsByNumericalPrefix = (sections: PRDSection[]): PRDSection[] => {
  return [...sections].sort((a, b) => {
    // Extract numerical prefixes if they exist (e.g., "1. Executive Summary")
    const aMatch = a.title.match(/^(\d+)\.\s/);
    const bMatch = b.title.match(/^(\d+)\.\s/);
    
    // If both have numerical prefixes, sort by the number
    if (aMatch && bMatch) {
      return parseInt(aMatch[1]) - parseInt(bMatch[1]);
    }
    
    // If only one has a numerical prefix, prioritize it
    if (aMatch) return -1;
    if (bMatch) return 1;
    
    // Otherwise, keep original order
    return 0;
  });
};

// Helper function to renumber sections after deletion
export const renumberSectionsAfterDeletion = (sections: PRDSection[]): PRDSection[] => {
  // First sort the sections by their current numerical prefix
  const sortedSections = sortSectionsByNumericalPrefix([...sections]);
  
  // Create a new array to hold the renumbered sections
  const renumberedSections: PRDSection[] = [];
  
  // Track sections with numerical prefixes and those without
  const numericalSections: PRDSection[] = [];
  const nonNumericalSections: PRDSection[] = [];
  
  // Separate sections with numerical prefixes from those without
  sortedSections.forEach(section => {
    const match = section.title.match(/^(\d+)\.\s(.*)/);
    if (match) {
      numericalSections.push({
        ...section,
        _originalTitle: section.title, // Store original for reference
        _titleWithoutNumber: match[2]  // Store title without number
      } as PRDSection & { _originalTitle: string; _titleWithoutNumber: string });
    } else {
      nonNumericalSections.push(section);
    }
  });
  
  // Renumber the numerical sections sequentially
  numericalSections.forEach((section, index) => {
    const newNumber = index + 1;
    const newTitle = `${newNumber}. ${(section as any)._titleWithoutNumber}`;
    
    // Create a new section with the updated title
    renumberedSections.push({
      ...section,
      title: newTitle
    });
    
    // Clean up temporary properties
    delete (renumberedSections[renumberedSections.length - 1] as any)._originalTitle;
    delete (renumberedSections[renumberedSections.length - 1] as any)._titleWithoutNumber;
  });
  
  // Add non-numerical sections at the end (maintaining their original order)
  renumberedSections.push(...nonNumericalSections);
  
  return renumberedSections;
};

// Helper function to update section references in content after renumbering
export const updateSectionReferencesInContent = (
  sections: PRDSection[], 
  originalSections: PRDSection[]
): PRDSection[] => {
  // Create a mapping from old section numbers to new ones
  const numberMapping = new Map<string, string>();
  
  // Build the mapping by comparing original titles with new titles
  originalSections.forEach(originalSection => {
    const originalMatch = originalSection.title.match(/^(\d+)\.\s/);
    if (originalMatch) {
      const originalNumber = originalMatch[1];
      
      // Find the corresponding new section
      const newSection = sections.find(s => 
        s.id === originalSection.id || 
        s.title.replace(/^\d+\.\s/, '') === originalSection.title.replace(/^\d+\.\s/, '')
      );
      
      if (newSection) {
        const newMatch = newSection.title.match(/^(\d+)\.\s/);
        if (newMatch) {
          const newNumber = newMatch[1];
          if (originalNumber !== newNumber) {
            numberMapping.set(originalNumber, newNumber);
          }
        }
      }
    }
  });
  
  // If we don't have any mappings, no need to update references
  if (numberMapping.size === 0) {
    return sections;
  }
  
  // Update references in all section content
  return sections.map(section => {
    let updatedContent = section.content;
    
    // Replace references like "Section X" or "section X" with updated numbers
    numberMapping.forEach((newNum, oldNum) => {
      const sectionRefRegex = new RegExp(`([Ss]ection\\s+)(${oldNum})([^\\d])`, 'g');
      updatedContent = updatedContent.replace(sectionRefRegex, `$1${newNum}$3`);
      
      // Also replace references like "X." at the beginning of a line (for nested lists)
      const listItemRegex = new RegExp(`(^|\\n)\\s*(${oldNum})\\.\\s`, 'g');
      updatedContent = updatedContent.replace(listItemRegex, `$1 ${newNum}. `);
    });
    
    return {
      ...section,
      content: updatedContent
    };
  });
};

// Combined function to handle section deletion and renumbering
export const handleSectionDeletion = (
  sections: PRDSection[], 
  sectionIdToDelete: string
): PRDSection[] => {
  // Store original sections for reference mapping
  const originalSections = [...sections];
  
  // Remove the specified section
  const filteredSections = sections.filter(section => section.id !== sectionIdToDelete);
  
  // If no section was removed or there are no sections left, return as is
  if (filteredSections.length === sections.length || filteredSections.length === 0) {
    return filteredSections;
  }
  
  // Renumber the remaining sections
  const renumberedSections = renumberSectionsAfterDeletion(filteredSections);
  
  // Update references to sections in content
  return updateSectionReferencesInContent(renumberedSections, originalSections);
};

/**
 * CRITICAL FUNCTION: Parses markdown into a PRD document structure while merging with an existing PRD.
 * 
 * This function is the core of the PRD content merging system. It ensures that:
 * 1. Modified sections from the new markdown are properly integrated
 * 2. Unmodified sections from the existing PRD are preserved
 * 3. Section IDs are maintained for continuity
 * 
 * The merging logic is carefully designed to prevent content loss during streaming updates.
 * Any changes to this function must maintain these guarantees to avoid content reversion issues.
 * 
 * @param markdown - The markdown content to parse (typically from streaming updates)
 * @param existingPRD - The existing PRD document to merge with (typically from sessionStorage)
 * @returns A new PRD document with merged content, or null if parsing fails
 */
export const parseChatMarkdownToPRDWithMerge = (markdown: string, existingPRD: PRDDocument | null = null): PRDDocument | null => {
  try {
    logger.debug('Parsing markdown to PRD with merge, markdown length:', markdown.length);
    
    // SAFETY CHECK: If no markdown content, return existing PRD unchanged
    // This prevents accidental content loss when empty updates are received
    if (!markdown.trim()) {
      logger.warn('Empty markdown provided to parseChatMarkdownToPRDWithMerge');
      return existingPRD;
    }
    
    const lines = markdown.split('\n');
    let title = existingPRD?.title || 'Untitled PRD';
    let description = existingPRD?.description || '';
    
    // Create a map of existing sections for efficient lookup
    // This is used to preserve section IDs and identify which sections are modified
    const existingSectionMap = new Map<string, PRDSection>();
    if (existingPRD?.sections?.length) {
      existingPRD.sections.forEach(section => {
        existingSectionMap.set(section.title.toLowerCase(), section);
      });
    }
    
    // These arrays and variables track the parsing state
    const sections: PRDSection[] = [];
    let currentSection: PRDSection | null = null;
    let readingState: 'title' | 'description' | 'section' = 'title';
    let hasFoundTitle = false;
    
    // CRITICAL: This set tracks which section titles have been processed in the new markdown
    // It's used later to determine which existing sections should be preserved
    let processedSectionTitles = new Set<string>();

    // PHASE 1: Extract sections from markdown
    // This phase identifies which sections are present in the new markdown
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      // Skip placeholder lines indicating unchanged content
      // These are typically added by AI to indicate sections that haven't changed
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']') && 
          (trimmedLine.toLowerCase().includes('unchanged') || 
           trimmedLine.toLowerCase().includes('continue') ||
           trimmedLine.toLowerCase().includes('same'))) {
        return;
      }

      // Parse title (level 1 heading)
      if (!hasFoundTitle && trimmedLine.startsWith('# ')) {
        title = trimmedLine.substring(2).trim();
        readingState = 'description';
        hasFoundTitle = true;
      } 
      // Parse section headings (level 2 headings)
      else if (trimmedLine.startsWith('## ')) {
        // Save the previous section if we were parsing one
        if (currentSection) {
          currentSection.content = currentSection.content.trimEnd();
          sections.push(currentSection);
        }
        
        // Extract section title and mark it as processed
        const sectionTitle = trimmedLine.substring(3).trim();
        processedSectionTitles.add(sectionTitle.toLowerCase());
        
        // Try to find an existing section with the same title to preserve its ID
        const existingSection = existingSectionMap.get(sectionTitle.toLowerCase());
        
        // Create a new section object, preserving the ID if it exists
        currentSection = {
          id: existingSection?.id || `section-${Date.now()}-${sections.length}`,
          title: sectionTitle,
          content: '',
        };
        readingState = 'section';
        
        // Ensure description is trimmed when we start parsing sections
        if (readingState === 'section' && hasFoundTitle) {
          description = description.trim();
        }
      } 
      // Parse description content (after title, before first section)
      else if (readingState === 'description' && hasFoundTitle) {
         description += line + '\n';
      } 
      // Parse section content (after section heading)
      else if (readingState === 'section' && currentSection) {
        currentSection.content += line + '\n';
      }
    });

    // Save the last section if we were parsing one
    if (currentSection) {
      const typedSection = currentSection as PRDSection;
      typedSection.content = typedSection.content.trimEnd();
      sections.push(typedSection);
    }

    description = description.trim();

    // SAFETY CHECK: If no valid content was found, return existing PRD unchanged
    // This prevents accidental content loss when invalid updates are received
    if (!hasFoundTitle && sections.length === 0 && !description) {
      logger.warn("No valid PRD content found in markdown");
      return existingPRD || null;
    }

    // Create new PRD document with merged content
    const newPRD: PRDDocument = {
      title,
      description,
      sections: [],
      lastUpdated: new Date().toISOString(),
    };

    // PHASE 2: Merge with existing sections
    // This is the CRITICAL part that ensures unmodified sections are preserved
    if (existingPRD?.sections) {
      // STEP 1: First add all UNMODIFIED sections from the existing PRD
      // These are sections that weren't mentioned in the new markdown
      for (const existingSection of existingPRD.sections) {
        const sectionTitleLower = existingSection.title.toLowerCase();
        if (!processedSectionTitles.has(sectionTitleLower)) {
          // IMPORTANT: This section wasn't in the update, so keep it EXACTLY as is
          // This is what preserves unmodified content during streaming updates
          newPRD.sections.push({...existingSection});
          logger.debug(`Preserving unmodified section: ${existingSection.title}`);
        }
      }
      
      // STEP 2: Now add all MODIFIED sections from the new markdown
      for (const updatedSection of sections) {
        const sectionTitleLower = updatedSection.title.toLowerCase();
        const existingSection = existingPRD.sections.find(
          section => section.title.toLowerCase() === sectionTitleLower
        );
        
        if (existingSection) {
          // This is an update to an existing section - preserve its ID
          newPRD.sections.push({
            id: existingSection.id, // CRITICAL: Maintain the same ID for continuity
            title: updatedSection.title,
            content: updatedSection.content
          });
          logger.debug(`Updated existing section: ${updatedSection.title}`);
        } else {
          // This is a completely new section
          newPRD.sections.push(updatedSection);
          logger.debug(`Added new section: ${updatedSection.title}`);
        }
      }
    } else if (sections.length > 0) {
      // No existing sections, just use the new ones
      newPRD.sections = [...sections];
    }

    // Sort sections by numerical prefix to maintain consistent order
    newPRD.sections = sortSectionsByNumericalPrefix(newPRD.sections);
    
    logger.debug(`Merged PRD has ${newPRD.sections.length} sections`);
    return newPRD;
  } catch (error) {
    // If anything goes wrong, preserve the existing PRD to prevent data loss
    logger.error('Error parsing markdown to PRD:', error);
    return existingPRD || null;
  }
};

/**
 * CRITICAL FUNCTION: Extracts and processes markdown content from streaming messages.
 * 
 * This function is responsible for extracting PRD content from chat messages,
 * determining if it's complete or partial, and ensuring content integrity by
 * merging with existing content when necessary.
 * 
 * The logic here is crucial for preventing content loss during streaming updates.
 * Any changes must maintain the careful balance of content preservation.
 * 
 * @param messages - Array of chat messages to extract PRD content from
 * @returns Processed markdown content, or null if no valid content found
 */
export const extractStreamingMarkdown = (messages: Message[]): string | null => {
  // Step 1: Find the most recent message containing PRD content
  const assistantMessages = messages.filter(msg => msg.role === 'assistant');
  if (assistantMessages.length === 0) return null;

  // Find the latest message with PRD document tags
  // We search in reverse order to get the most recent one first
  const latestPrdMessage = assistantMessages
    .slice()
    .reverse()
    .find(msg => typeof msg.content === 'string' && msg.content.includes('<prd_document>'));

  if (!latestPrdMessage || typeof latestPrdMessage.content !== 'string') {
    return null;
  }

  const content = latestPrdMessage.content;
  const startIndex = content.indexOf('<prd_document>');

  if (startIndex !== -1) {
    const endIndex = content.indexOf('</prd_document>', startIndex);
    let extractedContent = '';
    
    // Step 2: Extract the content between the PRD document tags
    if (endIndex !== -1) {
      // CASE: Complete document with closing tag
      extractedContent = content.substring(startIndex + '<prd_document>'.length, endIndex).trim();
    } else {
      // CASE: Partial document (no closing tag) - this happens during streaming
      extractedContent = content.substring(startIndex + '<prd_document>'.length).trim();
    }
    
    // Step 3: Analyze the extracted content to determine if it's complete
    // A complete document has a title and at least two sections
    const hasTitle = /^#\s+.+$/m.test(extractedContent);
    const sectionHeadingMatches = extractedContent.match(/^##\s+.+$/gm);
    const hasMultipleSections = sectionHeadingMatches && sectionHeadingMatches.length >= 2;
    
    // Step 4: Clean the content of any placeholder text
    // This removes AI-generated placeholders like "[rest of section unchanged]"
    const cleanedContent = removePlaceholderText(extractedContent);
    
    // Step 5: Process based on content completeness
    if (hasTitle && hasMultipleSections) {
      // CASE A: We have a complete document with title and multiple sections
      // This is the happy path - we can use the content directly
      logger.debug('Extracted complete PRD document with title and multiple sections');
      return cleanedContent;
    } else {
      // CASE B: Document is incomplete or partial
      // This is the critical path that prevents content loss during streaming
      logger.warn("Extracted content appears to be incomplete - attempting to merge with stored PRD");
      
      try {
        // Step 6: Attempt to merge with existing content from storage
        const storedPRD = sessionStorage.getItem('current_prd');
        if (storedPRD) {
          const parsedPRD = JSON.parse(storedPRD) as PRDDocument;
          
          // CRITICAL OPERATION: Merge the partial content with the stored PRD
          // This is what ensures unmodified sections are preserved during updates
          const mergedPRD = parseChatMarkdownToPRDWithMerge(cleanedContent, parsedPRD);
          
          if (mergedPRD) {
            // Generate full markdown from the merged PRD
            // This ensures we have a complete representation with all sections
            const fullMarkdown = generateFullMarkdown(mergedPRD);
            logger.debug('Successfully merged partial content with stored PRD');
            return fullMarkdown;
          }
        }
      } catch (error) {
        // If merging fails, log the error but continue with what we have
        // This prevents complete failure when partial recovery is possible
        logger.error('Error merging with stored PRD while extracting markdown', error);
      }
      
      // Step 7: Fallback - if we couldn't merge or there's no stored PRD
      // Return what we have, which is better than nothing
      return cleanedContent;
    }
  }
  
  // No valid content found
  return null;
};

// Make sure removePlaceholderText is exported if it wasn't already (it's used by generateFullMarkdown, so it likely is, but also needed by PRDChat)
export { removePlaceholderText }; 