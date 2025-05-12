import { v4 as uuidv4 } from 'uuid';

export interface Prompt {
  id: string;
  content: string;
  created_at: number;
}

export class PromptService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async ensureTableExists(): Promise<void> {
    try {
      // Create the table if it doesn't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS prompts (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      console.log('Prompts table verified');
    } catch (error) {
      console.error('Error ensuring table exists:', error);
      throw error;
    }
  }

  async savePrompt(content: string): Promise<void> {
    try {
      // First ensure the table exists
      await this.ensureTableExists();
      
      // Insert the prompt
      const id = uuidv4();
      const timestamp = Date.now();
      
      console.log(`Saving prompt with ID: ${id}`);
      
      const result = await this.db
        .prepare('INSERT INTO prompts (id, content, created_at) VALUES (?, ?, ?)')
        .bind(id, content, timestamp)
        .run();
        
      console.log('Database write result:', result);
    } catch (error) {
      console.error('Error saving prompt to database:', error);
      throw error;
    }
  }
}
