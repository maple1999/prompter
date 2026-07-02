import { LLMConfig } from './config';
import { SSEStreamParser } from './sse-parser';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LLMClient {
  private config: { baseURL: string, apiKey: string, model: string, temperature: number, maxTokens: number };

  constructor(config: { baseURL: string, apiKey: string, model: string, temperature: number, maxTokens: number }) {
    this.config = config;
  }

  async *streamChat(messages: LLMMessage[]): AsyncGenerator<string> {
    const url = LLMConfig.chatCompletionsURL(this.config.baseURL);
    
    const body = {
      model: this.config.model,
      messages: messages,
      stream: true,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${await response.text()}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const parser = new SSEStreamParser();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.feed(chunk);

        for (const event of events) {
          if (event.data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(event.data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', event.data);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async *stream(userPrompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const messages: LLMMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });
    
    yield* this.streamChat(messages);
  }

  async *streamVision(imageBase64: string, prompt: string): AsyncGenerator<string> {
    const url = LLMConfig.chatCompletionsURL(this.config.baseURL);
    
    const body = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]
        }
      ],
      stream: true,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${await response.text()}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const parser = new SSEStreamParser();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.feed(chunk);

        for (const event of events) {
          if (event.data === '[DONE]') return;
          try {
            const parsed = JSON.parse(event.data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
