import { LLMConfig } from './config';
import { SSEStreamParser } from './sse-parser';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  /** 纯文本，或 OpenAI 多模态 content 数组 */
  content: string | Array<Record<string, unknown>>;
}

export interface LLMClientConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface StreamOverrides {
  /** 请求 response_format: json_object（对齐 macOS streamVision 的 jsonResponse） */
  jsonResponse?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/** 单次读取之间允许的最长静默；超过判定为流挂起，中止请求。 */
const STALL_TIMEOUT_MS = 90_000;

export class LLMClient {
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = config;
  }

  streamChat(messages: LLMMessage[], overrides?: StreamOverrides): AsyncGenerator<string> {
    return this.runStream(messages, overrides ?? {});
  }

  stream(userPrompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const messages: LLMMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });
    return this.runStream(messages, {});
  }

  /**
   * 多模态流式请求（对齐 macOS streamVision(userPrompt:imageData:)）：
   * systemPrompt 走 system role，附带图片，默认要求严格 JSON 响应。
   */
  streamVision(
    opts: {
      systemPrompt: string;
      userPrompt: string;
      imageBase64: string;
    } & StreamOverrides
  ): AsyncGenerator<string> {
    const messages: LLMMessage[] = [];
    if (opts.systemPrompt.trim().length > 0) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: opts.userPrompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${opts.imageBase64}` } },
      ],
    });
    return this.runStream(messages, {
      jsonResponse: opts.jsonResponse ?? true,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }

  private async *runStream(
    messages: LLMMessage[],
    overrides: StreamOverrides
  ): AsyncGenerator<string> {
    const url = LLMConfig.chatCompletionsURL(this.config.baseURL);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: true,
      temperature: overrides.temperature ?? this.config.temperature,
      max_tokens: overrides.maxTokens ?? this.config.maxTokens,
    };
    if (overrides.jsonResponse) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    let stallTimer: NodeJS.Timeout | null = null;
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
    };

    armStallTimer();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (stallTimer) clearTimeout(stallTimer);
      throw e;
    }

    if (!response.ok) {
      if (stallTimer) clearTimeout(stallTimer);
      throw new Error(`HTTP Error ${response.status}: ${await response.text()}`);
    }
    if (!response.body) {
      if (stallTimer) clearTimeout(stallTimer);
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const parser = new SSEStreamParser();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        armStallTimer();

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
          } catch {
            console.warn('Failed to parse SSE data:', event.data);
          }
        }
      }
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      // 调用方提前 break（如 isStopped）时也确保底层请求被取消
      controller.abort();
      try {
        reader.releaseLock();
      } catch {
        // reader 可能已因 abort 失效
      }
    }
  }
}
