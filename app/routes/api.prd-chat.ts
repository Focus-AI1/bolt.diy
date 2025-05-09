import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream } from 'ai';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

// Basic structure adapted from api.chat.ts for PRD-specific chat
// Using specialized PRD prompt for Product Requirements Document creation

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
  
  // // Force Perplexity as the provider for PRD chat regardless of cookie settings
  // providerSettings.defaultProvider = 'perplexity';
  
  // // If you need to also set a specific model for Perplexity, you can do that here:
  // if (providerSettings.perplexity) {
  //   providerSettings.perplexity.defaultModel = 'perplexity/sonar-huge-online'; // or whichever model you prefer
  // } else {
  //   providerSettings.perplexity = {
  //     defaultModel: 'perplexity/sonar-huge-online',
  //     enabled: true
  //   };
  // }

  const stream = new SwitchableStream();
  const encoder: TextEncoder = new TextEncoder();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  
  let lastChunk: string | undefined = undefined;

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
           promptId: promptId || 'prd', // Default to PRD prompt if none specified
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
      onError: (error: any) => `Custom error: ${error.message}`,
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"__boltThought__\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
      }),
    );

    return new Response(dataStreamResult, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });

  } catch (error: any) {
    logger.error('Error in PRD chat action:', error);
    
    if (error.message?.includes('API key')) {
      throw new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
