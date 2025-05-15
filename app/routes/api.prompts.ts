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

    // Check if DB binding exists with detailed diagnostics
    const DB = context.cloudflare.env.DB;
    
    if (!DB) {
      // Enhanced diagnostics for debugging binding issues
      console.error('CRITICAL ERROR: D1 database binding not available in context.env.DB');
      
      // Log the complete environment structure for debugging
      console.log('Complete context structure:', JSON.stringify({
        contextKeys: Object.keys(context || {}),
        envKeys: context?.env ? Object.keys(context.env) : 'env not found',
        hasEnv: !!context?.env,
        hasDB: !!context?.env?.DB,
        envType: context?.env ? typeof context.env : 'N/A',
      }));
      
      return json({ 
        success: false, 
        message: 'Database binding not available - please check Cloudflare configuration',
        debug: {
          hasContext: !!context,
          hasEnv: !!context?.env,
          availableKeys: context?.env ? Object.keys(context.env) : []
        }
      }, { status: 500 });
    }
    
    // Additional verification that DB is actually a D1 database object
    if (typeof DB.prepare !== 'function' || typeof DB.exec !== 'function') {
      console.error('DB binding exists but does not appear to be a valid D1 database');
      return json({ 
        success: false, 
        message: 'Invalid DB binding - not a valid D1 database instance',
        debug: {
          dbType: typeof DB,
          hasDbPrepare: typeof DB.prepare === 'function',
          hasDbExec: typeof DB.exec === 'function'
        } 
      }, { status: 500 });
    }
    
    // DB binding exists and appears valid, save to database
    console.log('D1 database binding found, attempting to save prompt...');
    const promptService = new PromptService(DB);
    const result = await promptService.savePrompt(content);
    
    return json({ 
      success: true, 
      message: 'Prompt saved to database',
      result 
    });
  } catch (error) {
    console.error('Error saving prompt:', error);
    return json({ 
      success: false,
      error: 'Error saving prompt', 
      details: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}
