import { IslandState, Preferences } from '../../shared/types';
import { SystemAudioCapture } from '../audio/system-audio';
import { MicAudioCapture } from '../audio/mic-audio';
import { SpeechRecognizer } from '../speech/recognizer';
import { VAD } from '../speech/vad';
import { LLMClient } from '../llm/client';
import { ReadingTracker } from '../matching/reading-tracker';
import { AutoHideTimer } from '../utils/auto-hide-timer';
import { InterviewTranscript } from '../utils/transcript';

export class InterviewCoordinator {
  private prefs: Preferences;
  private onStateUpdate: (state: IslandState) => void;
  private isStopped = true;

  private sysAudio: SystemAudioCapture | null = null;
  private micAudio: MicAudioCapture | null = null;
  private speech: SpeechRecognizer | null = null;
  private vad: VAD | null = null;
  private llm: LLMClient;
  private transcript = new InterviewTranscript();
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

  async start() {
    this.isStopped = false;
    this.transcript = new InterviewTranscript(); // Reset

    this.sysAudio = new SystemAudioCapture();
    this.speech = new SpeechRecognizer(this.prefs.apiKey, this.prefs.language);
    this.micAudio = new MicAudioCapture();

    this.vad = new VAD(this.prefs.interviewVADSilence, () => {
      this.finalizeQuestion();
    });

    this.autoHide = new AutoHideTimer(this.prefs.autoHideSeconds * 1000, () => {
      if (!this.isStopped) {
        // Go back to listening phase
        this.startListeningPhase();
      }
    });

    try {
      await this.sysAudio.start((buffer) => {
        // Feed to speech recognizer
      });
      this.startListeningPhase();
    } catch (e) {
      this.onStateUpdate({ type: 'error', message: '系统音频捕获失败' });
    }
  }

  stop() {
    this.isStopped = true;
    this.sysAudio?.stop();
    this.micAudio?.stop();
    this.speech?.stop();
    this.vad?.stop();
    this.autoHide?.stop();
  }

  private startListeningPhase() {
    if (this.isStopped) return;
    this.onStateUpdate({ type: 'listening', transcript: '' });
    
    this.speech?.start();
    this.speech?.on('update', (update) => {
      if (this.isStopped) return;
      this.vad?.reportVoice();
      this.onStateUpdate({ type: 'listening', transcript: update.text });
    });
  }

  public finalizeQuestion() {
    if (this.isStopped) return;
    this.speech?.stop();
    
    // In a real implementation, we would get the final text from the recognizer.
    const questionText = "面试官的问题（占位符）";
    
    this.onStateUpdate({ type: 'thinking' });
    this.processLLM(questionText);
  }

  private async processLLM(question: string) {
    if (this.isStopped) return;

    let systemPrompt = this.prefs.systemPrompt;
    if (this.prefs.resumeText) {
      systemPrompt += `\n\n【我的个人简历信息如下】：\n${this.prefs.resumeText}`;
    }

    const messages = this.transcript.chatMessages(6);
    messages.push({ role: 'user', content: question });
    
    // Add system prompt at the beginning
    messages.unshift({ role: 'system', content: systemPrompt });

    let fullAnswer = '';
    const tracker = new ReadingTracker('');
    
    try {
      const stream = this.llm.streamChat(messages);
      
      for await (const chunk of stream) {
        if (this.isStopped) break;
        fullAnswer += chunk;
        
        // Very basic hack for streaming tracker
        // Real implementation re-tokenizes the growing string
        tracker['referenceTokens'].push({ normalized: chunk, display: chunk });
        tracker['statuses'].push('unread');
        
        this.onStateUpdate({ type: 'teleprompter', payload: tracker.snapshot() });
      }

      this.transcript.append(question, fullAnswer);
      
      // Phase: Reading
      this.startReadingPhase(tracker);

    } catch (e) {
      this.onStateUpdate({ type: 'error', message: 'LLM请求失败' });
      this.autoHide?.pet(); // auto hide the error
    }
  }

  private startReadingPhase(tracker: ReadingTracker) {
    if (this.isStopped) return;
    
    // Track reading via mic
    this.speech?.start();
    this.speech?.on('update', (update) => {
      if (this.isStopped) return;
      tracker.ingest(update.text);
      this.onStateUpdate({ type: 'teleprompter', payload: tracker.snapshot() });
      this.autoHide?.pet();
    });

    this.autoHide?.pet();
  }

  getTranscript() {
    return this.transcript;
  }
}
