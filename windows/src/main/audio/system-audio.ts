export class SystemAudioCapture {
  // TODO: Implement WASAPI Loopback Capture
  // Since Windows does not natively support process-level filtering out-of-the-box easily 
  // via Node.js, we will need a native addon (e.g. node-audio-rec or N-API C++ addon)
  // or use Electron's desktopCapturer audio (which captures the entire system audio).
  
  async start(onBuffer: (pcmData: Float32Array, sampleRate: number) => void): Promise<void> {
    console.warn('SystemAudioCapture stub started');
    // For now, this is a stub. Real implementation requires WASAPI.
  }

  stop(): void {
    console.warn('SystemAudioCapture stub stopped');
  }
}
