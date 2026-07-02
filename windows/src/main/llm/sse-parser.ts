export interface SSEEvent {
  event?: string;
  data: string;
}

export class SSEStreamParser {
  private buffer = '';

  /**
   * Feed a chunk of text into the parser, returns any complete SSE events.
   */
  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];
    
    // SSE messages are separated by double newlines
    let doubleNewlineIdx: number;
    while ((doubleNewlineIdx = this.buffer.indexOf('\n\n')) !== -1) {
      const message = this.buffer.slice(0, doubleNewlineIdx);
      this.buffer = this.buffer.slice(doubleNewlineIdx + 2);
      
      const parsed = this.parseMessage(message);
      if (parsed) {
        events.push(parsed);
      }
    }
    
    return events;
  }

  private parseMessage(message: string): SSEEvent | null {
    const lines = message.split('\n');
    let eventType: string | undefined;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith(':')) continue; // Comment

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        // Field name only
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
      data: dataLines.join('\n')
    };
  }
}
