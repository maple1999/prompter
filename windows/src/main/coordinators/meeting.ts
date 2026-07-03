import { IslandState, Preferences } from '../../shared/types';
import { ReadingTracker } from '../matching/reading-tracker';
import { AudioCaptureService } from '../audio/capture-service';
import { SpeechRecognizer, ASRConfig } from '../speech/recognizer';
import { AutoHideTimer } from '../utils/auto-hide-timer';

/** 从偏好解析 ASR 配置：ASR 字段留空则复用 LLM 的 baseURL / apiKey。 */
export function asrConfigFrom(prefs: Preferences): ASRConfig {
  return {
    baseURL: prefs.asrBaseURL.trim() || prefs.baseURL,
    apiKey: prefs.asrApiKey.trim() || prefs.apiKey,
    model: prefs.asrModel,
    language: prefs.language,
  };
}

/**
 * 会议模式（对齐 macOS MeetingSessionCoordinator）：
 *   1. start()：稿件 → ReadingTracker → 麦克风 + ASR；
 *   2. 每次 ASR partial → tracker.ingest → teleprompter 状态；
 *   3. autoHideSeconds 无语音 → 停止会话、收回 compact；
 *   4. stop()：清理所有资源。
 */
export class MeetingCoordinator {
  private prefs: Preferences;
  private onStateUpdate: (state: IslandState) => void;
  private capture: AudioCaptureService;
  private isStopped = false;

  private tracker: ReadingTracker | null = null;
  private recognizer: SpeechRecognizer | null = null;
  private autoHide: AutoHideTimer | null = null;
  private errorTimer: NodeJS.Timeout | null = null;

  constructor(
    prefs: Preferences,
    onStateUpdate: (state: IslandState) => void,
    capture: AudioCaptureService
  ) {
    this.prefs = prefs;
    this.onStateUpdate = onStateUpdate;
    this.capture = capture;
  }

  async start(): Promise<void> {
    this.isStopped = false;

    if (!this.prefs.script || this.prefs.script.trim() === '') {
      this.failWith('请在「设置 → 会议稿件」粘贴需要朗读的文本');
      return;
    }
    const asrCfg = asrConfigFrom(this.prefs);
    if (!asrCfg.apiKey) {
      this.failWith('请先在「设置 → LLM / 语音识别」配置 API Key');
      return;
    }

    const tracker = new ReadingTracker(this.prefs.script);
    if (tracker.snapshot().tokens.length === 0) {
      this.failWith('稿件内容为空');
      return;
    }
    this.tracker = tracker;
    this.onStateUpdate({ type: 'teleprompter', payload: tracker.snapshot() });

    const recognizer = new SpeechRecognizer(asrCfg);
    this.recognizer = recognizer;

    this.autoHide = new AutoHideTimer(this.prefs.autoHideSeconds * 1000, () => {
      // 与 macOS 一致：无语音超时 → 结束会话并收回
      this.stop();
      this.onStateUpdate({ type: 'compact' });
    });

    recognizer.on('update', (update: { text: string }) => {
      if (this.isStopped) return;
      this.autoHide?.pet();
      const payload = this.tracker!.ingest(update.text);
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
    if (this.isStopped) {
      void this.capture.stop();
      return;
    }

    recognizer.start();
    this.autoHide.pet();
  }

  stop(): void {
    this.isStopped = true;
    void this.capture.stop();
    this.recognizer?.stop();
    this.recognizer = null;
    this.autoHide?.stop();
    this.autoHide = null;
    this.tracker = null;
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
  }

  /** 显示错误并终止会话；几秒后收回 compact（外层 sink 会拦掉过期协调器的更新）。 */
  private failWith(message: string): void {
    this.stop();
    this.onStateUpdate({ type: 'error', message });
    this.errorTimer = setTimeout(() => {
      this.onStateUpdate({ type: 'compact' });
    }, 4000);
  }
}
