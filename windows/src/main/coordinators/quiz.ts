import { desktopCapturer, clipboard } from 'electron';
import { IslandState, Preferences, QuizAnswerPayload } from '../../shared/types';
import { LLMClient } from '../llm/client';
import { AutoHideTimer } from '../utils/auto-hide-timer';

export class QuizCoordinator {
  private prefs: Preferences;
  private onStateUpdate: (state: IslandState) => void;
  private llm: LLMClient;
  private autoHide: AutoHideTimer | null = null;

  constructor(prefs: Preferences, onStateUpdate: (state: IslandState) => void) {
    this.prefs = prefs;
    this.onStateUpdate = onStateUpdate;
    this.llm = new LLMClient({
      baseURL: prefs.baseURL,
      apiKey: prefs.apiKey,
      model: prefs.model,
      temperature: prefs.temperature,
      maxTokens: prefs.maxTokens
    });
  }

  async captureAndSolve() {
    this.onStateUpdate({ type: 'thinking' });

    try {
      // 1. Capture Screen
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
      const primarySource = sources[0]; // Simplification: just grab primary screen
      
      const imageBase64 = primarySource.thumbnail.toDataURL(); // Format: data:image/png;base64,...
      const base64Data = imageBase64.replace(/^data:image\/png;base64,/, '');

      // 2. Call Vision LLM
      const systemPrompt = this.prefs.quizSystemPrompt || 
        "你是一个笔试辅助助手。请提取图片中的题目并给出答案。必须返回 JSON 格式：{ \"kind\": \"choice\"|\"fill\"|\"coding\", \"answer\": \"...\", \"reasoning\": \"...\" }";

      const stream = this.llm.streamVision(base64Data, systemPrompt);
      let fullJsonStr = '';

      for await (const chunk of stream) {
        fullJsonStr += chunk;
      }

      // 3. Parse JSON
      fullJsonStr = fullJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      const payload: QuizAnswerPayload = JSON.parse(fullJsonStr);

      // 4. Auto-copy coding answers
      if (payload.kind === 'coding') {
        clipboard.writeText(payload.answer);
        payload.codeCopied = true;
      }

      // 5. Display Answer
      // Note: macOS version has a specific QuizAnswerView which maps to a teleprompter payload hack 
      // or custom state. For Windows we map it to 'teleprompter' state but we need a way to pass quiz data.
      // Let's use a specific token format as a hack, or ideally add a 'quiz' state. 
      // We'll just display it as a single block of text for now to match TeleprompterPayload structure.
      this.onStateUpdate({
        type: 'teleprompter',
        payload: {
          tokens: [payload.answer, '\n\n解析：', payload.reasoning],
          displayTokens: [`[${payload.kind === 'coding' ? '代码已复制' : payload.kind}] ${payload.answer}`, '\n\n解析：\n', payload.reasoning],
          statuses: ['matched', 'unread', 'unread'],
          cursor: 0
        }
      });

      // 6. Auto hide
      this.autoHide = new AutoHideTimer(this.prefs.autoHideSeconds * 1000 * 2, () => {
        this.onStateUpdate({ type: 'compact' });
      });
      this.autoHide.pet();

    } catch (e) {
      console.error(e);
      this.onStateUpdate({ type: 'error', message: '截图或大模型解析失败' });
      setTimeout(() => this.onStateUpdate({ type: 'compact' }), 3000);
    }
  }
}

// Note: I need to add streamVision to LLMClient.
