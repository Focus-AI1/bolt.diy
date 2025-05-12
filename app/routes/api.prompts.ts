// import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
// import { PromptService } from '~/lib/db/prompt-service';

// export async function action({ request, context }: ActionFunctionArgs) {
//   const { DB } = context.env;
  
//   if (!DB) {
//     return json({ error: 'Database connection not available' }, { status: 500 });
//   }

//   // Only handle POST requests for saving prompts
//   if (request.method !== 'POST') {
//     return json({ error: 'Method not supported' }, { status: 405 });
//   }

//   const promptService = new PromptService(DB);

//   try {
//     const formData = await request.formData();
//     const content = formData.get('content') as string;

//     if (!content) {
//       return json({ error: 'Content is required' }, { status: 400 });
//     }

//     await promptService.createPrompt(content);
//     return json({ success: true, message: 'Prompt saved successfully' });
//   } catch (error) {
//     console.error('Error saving prompt:', error);
//     return json({ error: 'Error saving prompt' }, { status: 500 });
//   }
// }
