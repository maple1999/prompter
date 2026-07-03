import { TranscriptEntry } from '../../shared/types';
import { LLMMessage } from '../llm/client';

export class InterviewTranscript {
  private _entries: TranscriptEntry[] = [];

  append(question: string, answer: string) {
    this._entries.push({
      question,
      answer,
      timestamp: Date.now()
    });
  }

  get entries(): TranscriptEntry[] {
    return this._entries;
  }

  get isEmpty(): boolean {
    return this._entries.length === 0;
  }

  chatMessages(limit: number = 6): LLMMessage[] {
    const messages: LLMMessage[] = [];
    const tail = this._entries.slice(-Math.floor(limit / 2));
    
    for (const entry of tail) {
      messages.push({ role: 'user', content: entry.question });
      messages.push({ role: 'assistant', content: entry.answer });
    }
    
    return messages;
  }

  exportMarkdown(): string {
    let md = '# 面试记录\n\n';
    
    const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    for (let i = 0; i < this._entries.length; i++) {
      const entry = this._entries[i];
      const dateStr = dateFormatter.format(new Date(entry.timestamp));
      
      md += `## 第 ${i + 1} 回合 - ${dateStr}\n\n`;
      md += `**面试官：**\n${entry.question}\n\n`;
      md += `**我：**\n${entry.answer}\n\n`;
      md += `---\n\n`;
    }

    return md;
  }
}
