export class LLMConfig {
  /** chat completions 端点。容忍 baseURL 已带 /v1 或完整路径（对齐 macOS 的 /v1 去重逻辑）。 */
  static chatCompletionsURL(baseURL: string): string {
    let url = baseURL.trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    if (url.endsWith('/chat/completions')) {
      return url;
    }
    if (url.endsWith('/v1')) {
      return url + '/chat/completions';
    }
    return url + '/v1/chat/completions';
  }

  /** ASR（Whisper 兼容）端点，同样容忍 /v1 变体。 */
  static audioTranscriptionsURL(baseURL: string): string {
    let url = baseURL.trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    if (url.endsWith('/audio/transcriptions')) {
      return url;
    }
    if (url.endsWith('/v1')) {
      return url + '/audio/transcriptions';
    }
    return url + '/v1/audio/transcriptions';
  }
}
