export class MicAudioCapture {
  // TODO: Implement Microphone Capture
  // Best done via Web Audio API in a hidden renderer window, or using Node.js NAudio binding.
  
  async start(onBuffer: (pcmData: Float32Array, sampleRate: number) => void): Promise<void> {
    console.warn('MicAudioCapture stub started');
  }

  stop(): void {
    console.warn('MicAudioCapture stub stopped');
  }
}
