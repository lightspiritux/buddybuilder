import { type Message } from 'ai';
import { OpenAIStream } from 'ai';

interface OpenAIError {
  error?: {
    message: string;
  };
}

export async function streamText(messages: Message[], env: any) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json() as OpenAIError;
    throw new Error(error.error?.message || 'Failed to generate completion');
  }

  return OpenAIStream(response);
}
