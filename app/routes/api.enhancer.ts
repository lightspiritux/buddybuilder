import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { StreamingTextResponse, parseStreamPart, type Message } from 'ai';
import { streamText } from '../lib/server/llm/stream-text';
import { stripIndents } from '../utils/stripIndent';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface CloudflareEnv {
  cloudflare: {
    env: {
      OPENAI_API_KEY: string;
    };
  };
}

type EnhancerMessage = Omit<Message, 'id'>;

export async function action(args: ActionFunctionArgs & CloudflareEnv) {
  return enhancerAction(args);
}

async function enhancerAction({ context, request }: ActionFunctionArgs & CloudflareEnv) {
  const { message } = await request.json<{ message: string }>();

  try {
    const messages: EnhancerMessage[] = [
      {
        role: 'user',
        content: stripIndents`
          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          IMPORTANT: Only respond with the improved prompt and nothing else!

          <original_prompt>
            ${message}
          </original_prompt>
        `,
      },
    ];

    const result = await streamText(
      messages as Message[],
      (context as CloudflareEnv).cloudflare.env,
    );

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const processedChunk = decoder
          .decode(chunk)
          .split('\n')
          .filter((line) => line !== '')
          .map(parseStreamPart)
          .map((part) => part.value)
          .join('');

        controller.enqueue(encoder.encode(processedChunk));
      },
    });

    const transformedStream = result.pipeThrough(transformStream);

    return new StreamingTextResponse(transformedStream);
  } catch (error) {
    console.log(error);

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
