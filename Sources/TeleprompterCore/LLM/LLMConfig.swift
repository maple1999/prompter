import Foundation

public struct LLMConfig: Sendable, Equatable {
    public var baseURL: URL
    public var apiKey: String
    public var model: String
    public var systemPrompt: String
    public var maxTokens: Int
    public var temperature: Double

    public init(
        baseURL: URL,
        apiKey: String,
        model: String = "gpt-4o-mini",
        systemPrompt: String = "",
        maxTokens: Int = 500,
        temperature: Double = 0.7
    ) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.model = model
        self.systemPrompt = systemPrompt
        self.maxTokens = maxTokens
        self.temperature = temperature
    }

    /// Chat completions 的完整 URL：{baseURL}/v1/chat/completions。
    /// 若用户已把 `/v1` 写进 baseURL（如某些代理），自动去重。
    public var chatCompletionsURL: URL {
        var path = baseURL.path
        if path.hasSuffix("/") { path.removeLast() }
        if path.hasSuffix("/v1") {
            return baseURL.appendingPathComponent("chat/completions")
        } else {
            return baseURL.appendingPathComponent("v1/chat/completions")
        }
    }
}

/// 常用 LLM 服务商预设。全部走 OpenAI 兼容的 /v1/chat/completions 协议，
/// 仅 baseURL 和推荐 model 不同。`.custom` 让用户全手填，向后兼容老配置。
public enum LLMProvider: String, Codable, Sendable, CaseIterable {
    case openAI
    case deepseek
    case moonshot
    case siliconflow
    case openrouter
    case ollama
    case custom

    public var displayName: String {
        switch self {
        case .openAI:      return "OpenAI"
        case .deepseek:    return "DeepSeek"
        case .moonshot:    return "Moonshot AI"
        case .siliconflow: return "SiliconFlow"
        case .openrouter:  return "OpenRouter"
        case .ollama:      return "Ollama 本地"
        case .custom:      return "自定义"
        }
    }

    public var defaultBaseURL: String {
        switch self {
        case .openAI:      return "https://api.openai.com"
        case .deepseek:    return "https://api.deepseek.com"
        case .moonshot:    return "https://api.moonshot.cn"
        case .siliconflow: return "https://api.siliconflow.cn"
        case .openrouter:  return "https://openrouter.ai/api"
        case .ollama:      return "http://localhost:11434"
        case .custom:      return ""
        }
    }

    public var defaultModel: String {
        switch self {
        case .openAI:      return "gpt-4o-mini"
        case .deepseek:    return "deepseek-chat"
        case .moonshot:    return "moonshot-v1-8k"
        case .siliconflow: return "Qwen/Qwen2.5-7B-Instruct"
        case .openrouter:  return "anthropic/claude-3.5-sonnet"
        case .ollama:      return "llama3.2"
        case .custom:      return ""
        }
    }
}
