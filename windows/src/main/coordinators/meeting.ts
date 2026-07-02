import { IslandState, Preferences } from '../../shared/types';
import { ReadingTracker } from '../matching/reading-tracker';
import { MicAudioCapture } from '../audio/mic-audio';
import { SpeechRecognizer } from '../speech/recognizer';
import { AutoHideTimer } from '../utils/auto-hide-timer';

export class MeetingCoordinator {
  private prefs: Preferences;
  private onStateUpdate: (state: IslandState) => void;
  private isStopped = true;

  private tracker: ReadingTracker | null = null;
  private mic: MicAudioCapture | null = null;
  private speech: SpeechRecognizer | null = null;
  private autoHide: AutoHideTimer | null = null;

  constructor(prefs: Preferences, onStateUpdate: (state: IslandState) => void) {
    this.prefs = prefs;
    this.onStateUpdate = onStateUpdate;
  }

  async start() {
    this.isStopped = false;
    
    if (!this.prefs.script || this.prefs.script.trim() === '') {
      this.onStateUpdate({ type: 'error', message: '请在设置中输入会议稿件' });
      return;
    }

    this.tracker = new ReadingTracker(this.prefs.script);
    this.onStateUpdate({ type: 'teleprompter', payload: this.tracker.snapshot() });

    this.mic = new MicAudioCapture();
    this.speech = new SpeechRecognizer(this.prefs.apiKey, this.prefs.language);

    this.autoHide = new AutoHideTimer(this.prefs.autoHideSeconds * 1000, () => {
      this.onStateUpdate({ type: 'compact' });
      this.stop();
    });

    this.speech.on('update', (update) => {
      if (this.isStopped) return;
      this.autoHide?.pet();
      
      this.tracker?.ingest(update.text);
      this.onStateUpdate({ type: 'teleprompter', payload: this.tracker!.snapshot() });
    });

    try {
      await this.mic.start((buffer) => {
        // Feed buffer to speech recognizer
      });
      this.speech.start();
    } catch (e) {
      this.onStateUpdate({ type: 'error', message: '麦克风权限或初始化失败' });
    }
  }

  stop() {
    this.isStopped = true;
    this.mic?.stop();
    this.speech?.stop();
    this.autoHide?.stop();
  }
}
