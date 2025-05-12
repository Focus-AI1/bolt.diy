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
      const id = uuidv4();
      const timestamp = Date.now();
      const title = content.split('\n')[0].substring(0, 50) || 'Untitled Prompt';
      
      await this.db
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
    } catch (error) {
      console.error('Error saving prompt:', error);
    }
  }

  async getPrompts(): Promise<Prompt[]> {
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM prompts ORDER BY created_at DESC')
        .all<Prompt>();
      
      return results;
    } catch (error) {
      console.error('Error retrieving prompts:', error);
      return [];
    }
  }
}
