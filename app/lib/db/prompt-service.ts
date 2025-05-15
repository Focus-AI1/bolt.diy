import { v4 as uuidv4 } from 'uuid';

export interface Prompt {
  id: string;
  content: string;
  created_at: number;
}

export interface DbResult {
  success: boolean;
  message: string;
  details?: any;
}

export class PromptService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async ensureTableExists(): Promise<DbResult> {
    try {
      // Create the table if it doesn't exist
      const result = await this.db.exec(`
        CREATE TABLE IF NOT EXISTS prompts (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `.replaceAll('\n', ''));
      
      console.log('Prompts table verified', result);
      return {
        success: true,
        message: 'Prompts table verified',
        details: result
      };
    } catch (error) {
      console.error('Error ensuring table exists:', error);
      return {
        success: false,
        message: 'Failed to ensure table exists',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async savePrompt(content: string): Promise<DbResult> {
    try {
      // First ensure the table exists
      const tableResult = await this.ensureTableExists();
      if (!tableResult.success) {
        return tableResult; // Return the table creation error
      }
      
      // Generate a unique ID for the prompt
      const id = uuidv4();
      const timestamp = Date.now();
      
      console.log(`Saving prompt with ID: ${id}`);
      
      // Validate content
      if (!content || typeof content !== 'string') {
        return {
          success: false,
          message: 'Invalid content provided',
          details: { 
            contentType: typeof content,
            contentLength: content ? content.length : 0
          }
        };
      }
      
      // Truncate extremely long content if necessary
      const maxContentLength = 100000; // 100K characters
      const truncatedContent = content.length > maxContentLength 
        ? content.substring(0, maxContentLength) 
        : content;
      
      if (truncatedContent.length < content.length) {
        console.warn(`Content truncated from ${content.length} to ${truncatedContent.length} characters`);
      }
      
      // Insert the prompt with proper error handling
      try {
        const result = await this.db
          .prepare('INSERT INTO prompts (id, content, created_at) VALUES (?, ?, ?)')
          .bind(id, truncatedContent, timestamp)
          .run();
          
        console.log('Database write result:', result);
        return {
          success: true,
          message: 'Prompt saved successfully',
          details: { 
            id,
            timestamp,
            dbResult: result
          }
        };
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        return {
          success: false,
          message: 'Database operation failed',
          details: dbError instanceof Error ? dbError.message : String(dbError)
        };
      }
    } catch (error) {
      console.error('Error saving prompt to database:', error);
      return {
        success: false,
        message: 'Error saving prompt to database',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
