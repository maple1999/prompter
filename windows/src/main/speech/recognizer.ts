import { TranscriptionUpdate } from '../../shared/types';
import { EventEmitter } from 'events';

export class SpeechRecognizer extends EventEmitter {
  private apiKey: string;
  private language: string;

  constructor(apiKey: string, language: string) {
    super();
    this.apiKey = apiKey;
    this.language = language;
  }

  // TODO: Actual implementation to accumulate audio and send to Whisper API
  // Whisper API does not support real-time streaming over HTTP (requires complete file).
  // For true real-time, we would need to continuously chunk audio and send it,
  // or use Azure Speech SDK. For the purpose of the prototype, this is a stub.

  async transcribe(audioBuffer: Buffer): Promise<string> {
    console.warn('SpeechRecognizer stub called');
    return '（云端语音识别占位文本）';
  }

  start() {
    this.emit('update', { text: '', isFinal: false } as TranscriptionUpdate);
  }

  stop() {
    // Stop recording
  }
}
