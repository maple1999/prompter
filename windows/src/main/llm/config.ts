export class LLMConfig {
  static chatCompletionsURL(baseURL: string): string {
    let url = baseURL;
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    
    // Auto-append if missing
    if (!url.endsWith('/v1/chat/completions') && !url.endsWith('/v1')) {
      url += '/v1/chat/completions';
    } else if (url.endsWith('/v1')) {
      url += '/chat/completions';
    }
    
    return url;
  }
}

// Note: In macOS there is an LLMProvider enum with presets.
// We can just rely on the user filling in baseURL and model in the Settings UI
// which is simpler and works universally.
