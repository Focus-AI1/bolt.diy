import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { PromptService } from '~/lib/db/prompt-service';

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

    // Check if DB binding exists
    const DB = context?.env?.DB;
    
    if (!DB) {
      console.error('CRITICAL ERROR: D1 database binding not available in context.env.DB');
      console.log('Context keys:', Object.keys(context || {}));
      console.log('Env keys:', Object.keys(context?.env || {}));
      return json({ 
        success: false, 
        message: 'Database binding not available - please check Cloudflare configuration' 
      }, { status: 500 });
    }
    
    // DB binding exists, save to database
    console.log('D1 database binding found, attempting to save prompt...');
    const promptService = new PromptService(DB);
    await promptService.savePrompt(content);
    
    return json({ success: true, message: 'Prompt saved to database' });
  } catch (error) {
    console.error('Error saving prompt:', error);
    return json({ 
      error: 'Error saving prompt', 
      details: error.message 
    }, { status: 500 });
  }
}
