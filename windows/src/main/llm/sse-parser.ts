export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * 将 SSE (Server-Sent Events) 文本流解析为逻辑事件。
 * 与 macOS SSEStreamParser.swift 一致：同时支持 `\n\n` 与 `\r\n\r\n` 分帧
 * （部分服务商/代理用 CRLF，只认 LF 会导致整条流静默丢失）。
 */
export class SSEStreamParser {
  private buffer = '';

  /** 喂入一段新文本，返回能解析出的完整事件列表。 */
  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];

    for (;;) {
      const lfIdx = this.buffer.indexOf('\n\n');
      const crlfIdx = this.buffer.indexOf('\r\n\r\n');

      let idx: number;
      let sepLen: number;
      if (lfIdx === -1 && crlfIdx === -1) break;
      if (lfIdx !== -1 && (crlfIdx === -1 || lfIdx < crlfIdx)) {
        idx = lfIdx;
        sepLen = 2;
      } else {
        idx = crlfIdx;
        sepLen = 4;
      }

      const message = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + sepLen);

      const parsed = this.parseMessage(message);
      if (parsed) {
        events.push(parsed);
      }
    }

    return events;
  }

  /** 流结束后冲刷残留 buffer（多数 SSE 以空行结束，通常返回空）。 */
  flush(): SSEEvent[] {
    if (this.buffer.length === 0) return [];
    const message = this.buffer;
    this.buffer = '';
    const parsed = this.parseMessage(message);
    return parsed ? [parsed] : [];
  }

  private parseMessage(message: string): SSEEvent | null {
    const lines = message.split('\n');
    let eventType: string | undefined;
    const dataLines: string[] = [];

    for (let line of lines) {
      // CRLF 行尾：去掉残留的 \r
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':')) continue; // SSE 注释

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        // 只有字段名
        if (line === 'data') dataLines.push('');
        continue;
      }

      const field = line.slice(0, colonIdx);
      let value = line.slice(colonIdx + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') {
        eventType = value;
      } else if (field === 'data') {
        dataLines.push(value);
      }
    }

    if (dataLines.length === 0) return null;

    return {
      event: eventType,
      data: dataLines.join('\n'),
    };
  }
}
