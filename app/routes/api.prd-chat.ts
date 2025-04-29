//Cannot find module 'openai' imported from '/app/app/routes/api.prd-chat.ts'
//please... always refer to api.chat.ts!
import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream } from 'ai';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

// Basic structure adapted from api.chat.ts for PRD-specific chat
// TODO: Implement PRD-specific logic if needed beyond standard chat streaming

export async function action(args: ActionFunctionArgs) {
  return prdChatAction(args);
}

const logger = createScopedLogger('api.prd-chat');

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());
  items.forEach((item) => {
    const [name, ...rest] = item.split('=');
    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });
  return cookies;
}

async function prdChatAction({ context, request }: ActionFunctionArgs) {
  // Simplified body parsing - adjust if PRD needs different inputs
  const { messages, promptId } = await request.json<{
    messages: Messages;
    promptId?: string;
    // Add other PRD-specific fields if necessary
  }>();

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');
  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  const stream = new SwitchableStream();
  const encoder: TextEncoder = new TextEncoder();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };

  try {
    const dataStreamResult = createDataStream({
      async execute(writer) {
        const options: StreamingOptions = {
          toolChoice: 'none',
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('PRD stream finished. Reason:', finishReason, 'Usage:', usage);
            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }
            // Simplified finish logic - no automatic continuation for PRD yet
            if (finishReason !== 'length') {
               writer.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
              // Optionally add progress annotations if needed for PRD steps
              await new Promise((resolve) => setTimeout(resolve, 0));
              // Closing is handled by createDataStream/Response
              return;
            }
             // Handle max length if necessary, maybe just stop for PRD?
             logger.warn('PRD message reached max token limit.');
              writer.writeMessageAnnotation({ // Still report usage
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
          },
        };

        logger.info(`Starting PRD streamText call`);
        const result = await streamText({
           messages,
           env: context.cloudflare?.env,
           options,
           apiKeys,
           providerSettings,
           promptId,
        });

        if (!result) {
           throw new Error('Failed to get result from streamText for PRD chat.');
        }

        logger.info(`PRD streamText call successful, merging stream into dataStream.`);
        
        // Use mergeIntoDataStream, passing the writer
        result.mergeIntoDataStream(writer);
        
        // Handle potential errors in the stream asynchronously (just log and throw)
        (async () => {
          for await (const part of result.fullStream) {
            if (part.type === 'error') {
              const error: any = part.error;
              logger.error('Error part received in PRD stream:', error);
              // Signal error by throwing
              throw error instanceof Error ? error : new Error('Unknown stream error'); 
            }
          }
        })().catch(err => {
           logger.error('Caught error while processing fullStream:', err);
           // Re-throwing signals failure to createDataStream
           throw err; 
        });

      },
       onError(error: unknown): string {
        logger.error('Error in PRD data stream:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred in the stream.';
        // Return JSON string for client
        return JSON.stringify({ error: errorMessage });
      },
    });

    // Pipe through a simple TransformStream like in api.chat.ts
    const responseStream = dataStreamResult.pipeThrough(new TransformStream());

     // Return the result of pipeThrough
    return new Response(responseStream, { 
      headers: {
         'Content-Type': 'text/event-stream; charset=utf-8',
         Connection: 'keep-alive',
         'Cache-Control': 'no-cache',
        },
    });

  } catch (error: any) {
    logger.error('Error in PRD chat action:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
