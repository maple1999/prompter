import { clipboard } from 'electron';
import { IslandState, Preferences, QuizAnswerPayload } from '../../shared/types';
import { LLMClient } from '../llm/client';
import { AutoHideTimer } from '../utils/auto-hide-timer';
import { RegionPicker, captureFullScreenImage } from '../windows/region-picker';

/**
 * 笔试助手（对齐 macOS QuizSessionCoordinator）。端到端：
 * 截屏（全屏 / 交互选区）→ Vision LLM（json_object）→ 解析 → quiz-answer 状态展示。
 *
 * 编程题的代码只进剪贴板，绝不显示在药丸上（answer 清空 + codeCopied 标记）。
 */
export class QuizCoordinator {
  private prefs: Preferences;
  private onStateUpdate: (state: IslandState) => void;
  private regionPicker: RegionPicker;
  private autoHide: AutoHideTimer | null = null;
  private errorTimer: NodeJS.Timeout | null = null;
  private isStopped = false;
  private busy = false;

  constructor(
    prefs: Preferences,
    onStateUpdate: (state: IslandState) => void,
    regionPicker: RegionPicker
  ) {
    this.prefs = prefs;
    this.onStateUpdate = onStateUpdate;
    this.regionPicker = regionPicker;
  }

  async captureAndSolve(): Promise<void> {
    if (this.isStopped || this.busy) return;
    this.busy = true;
    this.clearTimers();

    try {
      if (!this.prefs.baseURL || !this.prefs.apiKey) {
        this.failWith('请先在「设置 → LLM」配置 baseURL 和 API Key');
        return;
      }

      // 1. 截屏
      let png: Buffer;
      if (this.prefs.quizScreenshotMode === 'interactive') {
        const picked = await this.regionPicker.pick();
        if (this.isStopped) return;
        if (picked === null) {
          // 用户 ESC 取消
          this.onStateUpdate({ type: 'compact' });
          return;
        }
        png = picked;
      } else {
        png = (await captureFullScreenImage()).toPNG();
      }
      if (this.isStopped) return;

      // 2. thinking
      this.onStateUpdate({ type: 'thinking' });

      // 3. Vision LLM（编程题代码可能长，maxTokens 至少 800；答题要稳，temperature 0.2）
      const llm = new LLMClient({
        baseURL: this.prefs.baseURL,
        apiKey: this.prefs.apiKey,
        model: this.prefs.model,
        temperature: this.prefs.temperature,
        maxTokens: this.prefs.maxTokens,
      });

      let accumulated = '';
      for await (const chunk of llm.streamVision({
        systemPrompt: this.prefs.quizSystemPrompt,
        userPrompt: '请按系统 prompt 回答这张截图里的题目',
        imageBase64: png.toString('base64'),
        maxTokens: Math.max(this.prefs.maxTokens, 800),
        temperature: 0.2,
      })) {
        if (this.isStopped) return;
        accumulated += chunk;
      }
      if (this.isStopped) return;

      // 4. 解析 JSON
      const payload = QuizCoordinator.parsePayload(accumulated);
      if (!payload) {
        this.failWith(`LLM 返回不是合法 JSON：${accumulated.slice(0, 80)}`);
        return;
      }

      // 5. 编程题：代码进剪贴板，answer 清空避免泄漏到药丸
      let final: QuizAnswerPayload = payload;
      if (payload.kind === 'coding' && payload.answer.length > 0) {
        clipboard.writeText(payload.answer);
        final = { ...payload, answer: '', codeCopied: true };
      }

      // 6. 展示
      this.onStateUpdate({ type: 'quiz-answer', payload: final });

      // 7. autoHideSeconds 后自动收回
      this.autoHide = new AutoHideTimer(this.prefs.autoHideSeconds * 1000, () => {
        if (this.isStopped) return;
        this.onStateUpdate({ type: 'compact' });
      });
      this.autoHide.pet();
    } catch (e) {
      if (!this.isStopped) {
        this.failWith(`截图或 LLM 请求失败：${e instanceof Error ? e.message : e}`);
      }
    } finally {
      this.busy = false;
    }
  }

  stop(): void {
    this.isStopped = true;
    this.clearTimers();
  }

  /**
   * 容忍 markdown 代码块包裹（部分 LLM 即使 prompt 要求也会加）。
   * 只剥前后缀 fence，不做全局替换 —— 避免误伤 answer 字段里的内容。
   */
  static parsePayload(text: string): QuizAnswerPayload | null {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      if (firstNewline !== -1) {
        cleaned = cleaned.slice(firstNewline + 1);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();
    }

    let obj: unknown;
    try {
      obj = JSON.parse(cleaned);
    } catch {
      return null;
    }
    if (typeof obj !== 'object' || obj === null) return null;
    const record = obj as Record<string, unknown>;

    const kind = record.kind;
    if (kind !== 'choice' && kind !== 'fill' && kind !== 'coding') return null;

    return {
      kind,
      answer: typeof record.answer === 'string' ? record.answer : '',
      reasoning: typeof record.reasoning === 'string' ? record.reasoning : '',
      language: typeof record.language === 'string' ? record.language : undefined,
      codeCopied: false,
    };
  }

  private failWith(message: string): void {
    this.onStateUpdate({ type: 'error', message });
    this.errorTimer = setTimeout(() => {
      if (!this.isStopped) {
        this.onStateUpdate({ type: 'compact' });
      }
    }, 4000);
  }

  private clearTimers(): void {
    this.autoHide?.stop();
    this.autoHide = null;
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
  }
}
