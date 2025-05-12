import { v4 as uuidv4 } from 'uuid';

export interface Prompt {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  tags?: string;
  user_id?: string;
  metadata?: string;
}

export class PromptService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async createPrompt(content: string): Promise<void> {
    try {
      // Validate database connection
      if (!this.db) {
        throw new Error('Database connection not available');
      }

      const id = uuidv4();
      const timestamp = Date.now();
      const title = content.split('\n')[0].substring(0, 50) || 'Untitled Prompt';
      
      console.log(`Inserting prompt: id=${id}, title=${title.substring(0, 20)}...`);
      
      const result = await this.db
        .prepare(
          'INSERT INTO prompts (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(
          id,
          title,
          content,
          timestamp,
          timestamp
        )
        .run();
        
      console.log('Database result:', result);
    } catch (error) {
      console.error('Error saving prompt to database:', error);
      // Re-throw to allow proper handling in the API
      throw new Error(`Database error: ${error.message}`);
    }
  }

  async getPrompts(): Promise<Prompt[]> {
    try {
      // Validate database connection
      if (!this.db) {
        throw new Error('Database connection not available');
      }
      
      console.log('Fetching prompts from database');
      const result = await this.db
        .prepare('SELECT * FROM prompts ORDER BY created_at DESC')
        .all<Prompt>();
        
      console.log(`Retrieved ${result.results?.length || 0} prompts`);
      
      return result.results || [];
    } catch (error) {
      console.error('Error retrieving prompts from database:', error);
      throw new Error(`Database query error: ${error.message}`);
    }
  }
}
