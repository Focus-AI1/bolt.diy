import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { PromptService } from '~/lib/db/prompt-service';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

// Mock storage for local development
const localPrompts: Array<{
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
}> = [];

export async function loader({ context }: LoaderFunctionArgs) {
  console.log('Env in loader:', context.env ? Object.keys(context.env) : 'No env');
  
  // Always try to use DB first, only fallback if it's clearly not available
  try {
    const { DB } = context.env || {};
    if (DB) {
      const promptService = new PromptService(DB);
      const prompts = await promptService.getPrompts();
      return json({ prompts });
    } else {
      console.log('DB binding not available, using local storage');
      return json({ prompts: localPrompts });
    }
  } catch (error) {
    console.error('Error retrieving prompts:', error);
    return json({ error: 'Error retrieving prompts', details: error.message }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  // Only handle POST requests for saving prompts
  if (request.method !== 'POST') {
    return json({ error: 'Method not supported' }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const content = formData.get('content') as string;

    if (!content) {
      return json({ error: 'Content is required' }, { status: 400 });
    }

    console.log('Context in action:', context ? 'Available' : 'Not available');
    console.log('Env in action:', context.env ? Object.keys(context.env) : 'No env');
    
    // Try to access DB directly with more defensive coding
    const DB = context?.env?.DB;
    
    if (!DB) {
      console.log('D1 database not available, using local storage fallback');
      const id = `local-${Date.now()}`;
      const timestamp = Date.now();
      const title = content.split('\n')[0].substring(0, 50) || 'Untitled Prompt';
      
      localPrompts.push({
        id,
        title,
        content,
        created_at: timestamp,
        updated_at: timestamp
      });
      
      return json({ success: true, message: 'Prompt saved to local storage' });
    }
    
    // If we got here, we have a DB connection
    console.log('D1 database available, saving to database');
    const promptService = new PromptService(DB);
    await promptService.createPrompt(content);
    return json({ success: true, message: 'Prompt saved to database' });
  } catch (error) {
    console.error('Error saving prompt:', error);
    return json({ error: 'Error saving prompt', details: error.message }, { status: 500 });
  }
}
