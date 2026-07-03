import { EventEmitter } from 'events';
import { TranscriptionUpdate } from '../../shared/types';
import { LLMConfig } from '../llm/config';

export interface ASRConfig {
  /** OpenAI 兼容服务的 baseURL（/v1/audio/transcriptions 会自动拼接） */
  baseURL: string;
  apiKey: string;
  /** 如 whisper-1 / FunAudioLLM/SenseVoiceSmall 等 */
  model: string;
  language: 'zh-CN' | 'en-US';
  /** 转写节拍，默认 2500ms */
  intervalMs?: number;
}

const SAMPLE_RATE = 16000;
/** 滑动窗口上限：超过后把头部提交为固定文本，避免长会话请求体无限增长 */
const WINDOW_MAX_SECONDS = 30;
const COMMIT_SECONDS = 25;
/** 少于这个时长不发请求 */
const MIN_SECONDS = 0.4;
/** 整窗 RMS 低于该值视为静音，跳过请求（也避免 Whisper 对纯静音的幻觉输出） */
const SILENCE_RMS = 0.004;
/** 单次转写请求超时 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * 分块伪流式语音识别。
 *
 * Windows 没有 SFSpeechRecognizer 的流式等价物，这里用「每 intervalMs 把当前
 * 音频窗整体重转写一次」的方式模拟流式 partial。对外语义与 macOS 保持一致：
 * `update` 事件携带**累积**文本（committed + 当前窗），只增不减（窗内修订除外），
 * 正好满足 ReadingTracker 对累积 transcript 的要求。
 *
 * 事件：
 *   'update' → TranscriptionUpdate { text, isFinal }
 *   'error'  → Error（连续 3 次请求失败才发，容忍网络抖动）
 */
export class SpeechRecognizer extends EventEmitter {
  private cfg: ASRConfig;
  private chunks: Float32Array[] = [];
  private chunkSamples = 0;
  private committedText = '';
  private currentText = '';
  private lastEmitted = '';
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private stopped = false;
  private controller: AbortController | null = null;
  private consecutiveFailures = 0;

  constructor(cfg: ASRConfig) {
    super();
    this.cfg = cfg;
  }

  /** 喂入 16 kHz mono Float32 PCM（来自 AudioCaptureService）。 */
  acceptPcm(pcm: Float32Array): void {
    if (this.stopped) return;
    this.chunks.push(pcm);
    this.chunkSamples += pcm.length;
  }

  /** 启动转写节拍。 */
  start(): void {
    if (this.stopped || this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.cfg.intervalMs ?? 2500);
  }

  /**
   * 停止节拍并对剩余音频做最后一次转写，返回完整累积文本。
   * 用于面试模式 finalizeQuestion 的收尾。
   */
  async finalize(): Promise<string> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // 等 in-flight 请求结束（最多 ~REQUEST_TIMEOUT_MS）
    while (this.inFlight && !this.stopped) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!this.stopped && this.windowSeconds() >= MIN_SECONDS && !this.isWindowSilent()) {
      try {
        this.currentText = await this.transcribe(this.concatWindow());
      } catch {
        // 收尾失败就用最近一次的结果
      }
    }
    this.emitUpdate(true);
    return this.committedText + this.currentText;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.controller?.abort();
    this.chunks = [];
    this.chunkSamples = 0;
    this.removeAllListeners();
  }

  // ── 内部 ──

  private windowSeconds(): number {
    return this.chunkSamples / SAMPLE_RATE;
  }

  private concatWindow(): Float32Array {
    const all = new Float32Array(this.chunkSamples);
    let offset = 0;
    for (const c of this.chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    return all;
  }

  private isWindowSilent(): boolean {
    let sumSq = 0;
    let n = 0;
    for (const c of this.chunks) {
      for (let i = 0; i < c.length; i += 4) {
        sumSq += c[i] * c[i];
        n++;
      }
    }
    if (n === 0) return true;
    return Math.sqrt(sumSq / n) < SILENCE_RMS;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    if (this.windowSeconds() < MIN_SECONDS) return;
    if (this.isWindowSilent() && this.currentText === '') return;

    this.inFlight = true;
    try {
      // 窗口过长：把头部 COMMIT_SECONDS 的音频提交为固定文本
      if (this.windowSeconds() > WINDOW_MAX_SECONDS) {
        const all = this.concatWindow();
        const commitSamples = COMMIT_SECONDS * SAMPLE_RATE;
        const head = all.subarray(0, commitSamples);
        const tail = all.slice(commitSamples);
        const headText = await this.transcribe(head);
        if (this.stopped) return;
        this.committedText += headText;
        this.chunks = [tail];
        this.chunkSamples = tail.length;
        this.currentText = '';
      }

      const text = await this.transcribe(this.concatWindow());
      if (this.stopped) return;
      this.currentText = text;
      this.consecutiveFailures = 0;
      this.emitUpdate(false);
    } catch (err) {
      if (this.stopped) return;
      this.consecutiveFailures++;
      if (this.consecutiveFailures === 3) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.inFlight = false;
    }
  }

  private emitUpdate(isFinal: boolean): void {
    const text = this.committedText + this.currentText;
    if (text !== this.lastEmitted || isFinal) {
      this.lastEmitted = text;
      const update: TranscriptionUpdate = { text, isFinal };
      this.emit('update', update);
    }
  }

  private async transcribe(pcm: Float32Array): Promise<string> {
    const wav = encodeWavPcm16(pcm, SAMPLE_RATE);
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', this.cfg.model);
    form.append('language', this.cfg.language.startsWith('zh') ? 'zh' : 'en');
    form.append('response_format', 'json');

    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller?.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = LLMConfig.audioTranscriptionsURL(this.cfg.baseURL);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
        body: form,
        signal: this.controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`ASR HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      }
      const json = (await resp.json()) as { text?: string };
      return (json.text ?? '').trim();
    } finally {
      clearTimeout(timeout);
      this.controller = null;
    }
  }
}

/** Float32 PCM → 16-bit PCM WAV 文件字节。 */
function encodeWavPcm16(pcm: Float32Array, sampleRate: number): Uint8Array {
  const dataLen = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buf);
}
