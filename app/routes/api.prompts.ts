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
  // Check if we're in development and DB is not available
  if (!context.env || !context.env.DB) {
    console.log('Using local prompt storage for development');
    return json({ prompts: localPrompts });
  }

  const { DB } = context.env;
  const promptService = new PromptService(DB);

  try {
    const prompts = await promptService.getPrompts();
    return json({ prompts });
  } catch (error) {
    console.error('Error retrieving prompts:', error);
    return json({ error: 'Error retrieving prompts' }, { status: 500 });
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

    // Check if we're in development and DB is not available
    if (!context.env || !context.env.DB) {
      console.log('Using local prompt storage for development');
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

    const { DB } = context.env;
    const promptService = new PromptService(DB);
    await promptService.createPrompt(content);
    return json({ success: true, message: 'Prompt saved successfully' });
  } catch (error) {
    console.error('Error saving prompt:', error);
    return json({ error: 'Error saving prompt' }, { status: 500 });
  }
}
