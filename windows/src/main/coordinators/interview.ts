import { IslandState, Preferences } from '../../shared/types';
import { AudioCaptureService } from '../audio/capture-service';
import { SpeechRecognizer } from '../speech/recognizer';
import { VAD } from '../speech/vad';
import { LLMClient, LLMMessage } from '../llm/client';
import { ReadingTracker } from '../matching/reading-tracker';
import { TokenNormalizer } from '../matching/token-normalizer';
import { AutoHideTimer } from '../utils/auto-hide-timer';
import { InterviewTranscript } from '../utils/transcript';
import { asrConfigFrom } from './meeting';

type Phase = 'idle' | 'listening' | 'thinking' | 'reading';

/**
 * 面试模式（对齐 macOS InterviewSessionCoordinator）：
 *
 * 阶段 A listening：系统音频 → ASR，VAD 静音超阈值或快捷键结束问题；
 * 阶段 B thinking：问题喂给 LLM，流式接收（首 token 后切 teleprompter 同步展示）；
 * 阶段 C reading：LLM 结束后启动麦克风 + ReadingTracker 追踪朗读；
 * 阶段 D：autoHideSeconds 无语音后自动回到 listening 等下一题。
 *
 * 音频源互斥：系统音频（听题）和麦克风（读稿）绝不同时运行 ——
 * AudioCaptureService.start() 内部会先停掉上一个源，这里也显式 stop。
 *
 * 每个阶段各建一个 SpeechRecognizer（与 macOS 一致），保证累积 transcript
 * 的计数从零开始；监听器随 recognizer.stop() 一并移除，不会跨阶段泄漏。
 */
export class InterviewCoordinator {
  private prefs: Preferences;
  private onStateUpdate: (state: IslandState) => void;
  private capture: AudioCaptureService;

  private phase: Phase = 'idle';
  private isStopped = false;

  private questionRecognizer: SpeechRecognizer | null = null;
  private readingRecognizer: SpeechRecognizer | null = null;
  private tracker: ReadingTracker | null = null;
  private vad: VAD | null = null;
  private autoHide: AutoHideTimer | null = null;
  private errorTimer: NodeJS.Timeout | null = null;

  private questionText = '';
  private readonly transcript = new InterviewTranscript();

  constructor(
    prefs: Preferences,
    onStateUpdate: (state: IslandState) => void,
    capture: AudioCaptureService
  ) {
    this.prefs = prefs;
    this.onStateUpdate = onStateUpdate;
    this.capture = capture;
  }

  getTranscript(): InterviewTranscript {
    return this.transcript;
  }

  async start(): Promise<void> {
    this.isStopped = false;

    if (!this.prefs.baseURL || !this.prefs.apiKey) {
      this.failWith('请先在「设置 → LLM」配置 baseURL 和 API Key');
      return;
    }
    await this.startListening();
  }

  // ── 阶段 A：听题 ──

  private async startListening(): Promise<void> {
    if (this.isStopped) return;
    this.clearErrorTimer();
    this.phase = 'listening';
    this.questionText = '';
    this.onStateUpdate({ type: 'listening', transcript: '' });

    const recognizer = new SpeechRecognizer(asrConfigFrom(this.prefs));
    this.questionRecognizer = recognizer;

    const vad = new VAD(Math.max(1, this.prefs.interviewVADSilence), () => {
      this.finalizeQuestion();
    });
    this.vad = vad;

    recognizer.on('update', (update: { text: string }) => {
      if (this.isStopped || this.phase !== 'listening') return;
      // 与 macOS 一致：只有 ASR 真识别到内容才算「有语音」
      vad.reportVoice();
      this.questionText = update.text;
      this.onStateUpdate({ type: 'listening', transcript: update.text });
    });

    recognizer.on('error', (err: Error) => {
      if (this.isStopped) return;
      this.failWith(`语音识别失败：${err.message}`);
    });

    try {
      await this.capture.start('system', (pcm) => recognizer.acceptPcm(pcm));
    } catch (e) {
      this.failWith(`系统音频捕获失败：${e instanceof Error ? e.message : e}`);
      return;
    }
    if (this.isStopped || this.phase !== 'listening') {
      return;
    }
    recognizer.start();
  }

  /** 由 VAD 静音或用户快捷键触发。只在 listening 阶段有效。 */
  finalizeQuestion(): void {
    if (this.isStopped || this.phase !== 'listening') return;

    this.vad?.stop();
    this.vad = null;
    this.questionRecognizer?.stop();
    this.questionRecognizer = null;
    void this.capture.stop();

    const q = this.questionText.trim();
    if (q === '') {
      // 没识别到内容：直接回 listening 等下一题，而不是跌成 compact 打断面试循环
      void this.startListening();
      return;
    }

    this.phase = 'thinking';
    this.onStateUpdate({ type: 'thinking' });
    void this.callLLM(q);
  }

  // ── 阶段 B：LLM ──

  private async callLLM(question: string): Promise<void> {
    if (this.isStopped) return;

    let systemPrompt = this.prefs.systemPrompt;
    const resume = this.prefs.resumeText.trim();
    if (resume) {
      systemPrompt += `\n\n---\n以下是我的个人简历，请参考简历内容作答：\n\n${resume}`;
    }

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];
    messages.push(...this.transcript.chatMessages(6));
    messages.push({ role: 'user', content: question });

    const llm = new LLMClient({
      baseURL: this.prefs.baseURL,
      apiKey: this.prefs.apiKey,
      model: this.prefs.model,
      temperature: this.prefs.temperature,
      maxTokens: this.prefs.maxTokens,
    });

    let fullAnswer = '';
    try {
      for await (const chunk of llm.streamChat(messages)) {
        if (this.isStopped) return;
        fullAnswer += chunk;
        this.showStreamingAnswer(fullAnswer);
      }
    } catch (e) {
      if (this.isStopped) return;
      this.showErrorThen(
        `LLM 请求失败：${e instanceof Error ? e.message : e}`,
        () => void this.startListening()
      );
      return;
    }
    if (this.isStopped) return;

    if (fullAnswer.trim() === '') {
      // LLM 没吐任何 token：不能卡在 thinking，回 listening 等下一题
      this.showErrorThen('LLM 没有返回内容', () => void this.startListening());
      return;
    }

    this.transcript.append(question, fullAnswer);
    await this.startReading(fullAnswer);
  }

  /** 流式过程中实时展示（tracker 尚未启用，所有 token 都是 unread）。 */
  private showStreamingAnswer(text: string): void {
    const tokens = TokenNormalizer.normalize(text);
    this.onStateUpdate({
      type: 'teleprompter',
      payload: {
        tokens: tokens.map((t) => t.normalized),
        displayTokens: tokens.map((t) => t.display),
        statuses: new Array(tokens.length).fill('unread'),
        cursor: 0,
      },
    });
  }

  // ── 阶段 C：朗读追踪 ──

  private async startReading(answer: string): Promise<void> {
    if (this.isStopped) return;
    this.phase = 'reading';

    const tracker = new ReadingTracker(answer);
    this.tracker = tracker;

    const recognizer = new SpeechRecognizer(asrConfigFrom(this.prefs));
    this.readingRecognizer = recognizer;

    const autoHide = new AutoHideTimer(this.prefs.autoHideSeconds * 1000, () => {
      this.readingTimeout();
    });
    this.autoHide = autoHide;

    recognizer.on('update', (update: { text: string }) => {
      if (this.isStopped || this.phase !== 'reading') return;
      autoHide.pet();
      const payload = tracker.ingest(update.text);
      this.onStateUpdate({ type: 'teleprompter', payload });
    });

    recognizer.on('error', (err: Error) => {
      if (this.isStopped) return;
      this.failWith(`语音识别失败：${err.message}`);
    });

    try {
      await this.capture.start('mic', (pcm) => recognizer.acceptPcm(pcm));
    } catch (e) {
      this.failWith(`麦克风启动失败：${e instanceof Error ? e.message : e}`);
      return;
    }
    if (this.isStopped || this.phase !== 'reading') {
      return;
    }
    recognizer.start();
    autoHide.pet();
  }

  /** 读稿阶段静音超时：清理读稿资源，回到 listening 等下一题。 */
  private readingTimeout(): void {
    if (this.isStopped || this.phase !== 'reading') return;
    void this.capture.stop();
    this.readingRecognizer?.stop();
    this.readingRecognizer = null;
    this.autoHide?.stop();
    this.autoHide = null;
    this.tracker = null;
    void this.startListening();
  }

  // ── 停止与错误 ──

  stop(): void {
    this.isStopped = true;
    this.phase = 'idle';
    this.vad?.stop();
    this.vad = null;
    this.questionRecognizer?.stop();
    this.questionRecognizer = null;
    this.readingRecognizer?.stop();
    this.readingRecognizer = null;
    void this.capture.stop();
    this.autoHide?.stop();
    this.autoHide = null;
    this.tracker = null;
    this.clearErrorTimer();
  }

  /** 致命错误：终止整个会话，展示错误后收回 compact。 */
  private failWith(message: string): void {
    this.stop();
    this.onStateUpdate({ type: 'error', message });
    this.errorTimer = setTimeout(() => {
      this.onStateUpdate({ type: 'compact' });
    }, 4000);
  }

  /** 非致命错误：展示几秒错误后执行 next（如回到 listening）。 */
  private showErrorThen(message: string, next: () => void): void {
    this.onStateUpdate({ type: 'error', message });
    this.clearErrorTimer();
    this.errorTimer = setTimeout(() => {
      if (!this.isStopped) next();
    }, 3000);
  }

  private clearErrorTimer(): void {
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
  }
}
