import Foundation

public enum LLMError: Error, Equatable, Sendable {
    case invalidResponse
    case httpStatus(Int, String)     // status, body 片段
    case decodingFailed(String)
    case network(String)
    case cancelled
}

/// OpenAI 兼容 /v1/chat/completions 客户端（流式）。
public final class LLMClient: @unchecked Sendable {
    private let config: LLMConfig
    private let session: URLSession

    public init(config: LLMConfig, session: URLSession = .shared) {
        self.config = config
        self.session = session
    }

    /// 流式请求。返回一个 AsyncThrowingStream，逐个吐 delta 文本片段。
    public func stream(userPrompt: String) -> AsyncThrowingStream<String, Error> {
        var messages: [[String: Any]] = []
        if !config.systemPrompt.isEmpty {
            messages.append(["role": "system", "content": config.systemPrompt])
        }
        messages.append(["role": "user", "content": userPrompt])
        return makeStream(messages: messages, jsonResponse: false)
    }

    /// 多轮对话流式请求。`messages` 是 user/assistant 交替的历史（不含 system prompt，由 config 自动注入）。
    public func streamChat(messages chatMessages: [[String: String]]) -> AsyncThrowingStream<String, Error> {
        var messages: [[String: Any]] = []
        if !config.systemPrompt.isEmpty {
            messages.append(["role": "system", "content": config.systemPrompt])
        }
        for msg in chatMessages {
            messages.append(msg as [String: Any])
        }
        return makeStream(messages: messages, jsonResponse: false)
    }

    /// 多模态流式请求：附带一张图片，要求 LLM 严格 JSON 响应（用于笔试助手）。
    /// 与 `stream(userPrompt:)` 共用同一条 SSE 解析路径，仅在 messages body 里塞 `image_url`。
    public func streamVision(userPrompt: String, imageData: Data) -> AsyncThrowingStream<String, Error> {
        var messages: [[String: Any]] = []
        if !config.systemPrompt.isEmpty {
            messages.append(["role": "system", "content": config.systemPrompt])
        }
        let dataURL = "data:image/png;base64,\(imageData.base64EncodedString())"
        messages.append([
            "role": "user",
            "content": [
                ["type": "text", "text": userPrompt],
                ["type": "image_url", "image_url": ["url": dataURL]],
            ] as [Any]
        ])
        return makeStream(messages: messages, jsonResponse: true)
    }

    private func makeStream(
        messages: [[String: Any]],
        jsonResponse: Bool
    ) -> AsyncThrowingStream<String, Error> {
        // 在创建 Task 之前把 non-Sendable 的 messages 序列化为 Data，
        // 这样 Task closure 只捕获 Sendable 类型（URLRequest, Data）。
        var body: [String: Any] = [
            "model": config.model,
            "messages": messages,
            "stream": true,
            "max_tokens": config.maxTokens,
            "temperature": config.temperature,
        ]
        if jsonResponse {
            body["response_format"] = ["type": "json_object"]
        }
        guard let httpBody = try? JSONSerialization.data(withJSONObject: body) else {
            return AsyncThrowingStream { $0.finish(throwing: LLMError.invalidResponse) }
        }

        var req = URLRequest(url: config.chatCompletionsURL)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        req.httpBody = httpBody
        let request = req

        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await self.runStream(request: request) { delta in
                        continuation.yield(delta)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }

    private func runStream(
        request: URLRequest,
        onDelta: @escaping (String) -> Void
    ) async throws {
        let (bytes, response) = try await session.bytes(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw LLMError.invalidResponse
        }

        if http.statusCode >= 400 {
            var bodyText = ""
            var count = 0
            for try await byte in bytes {
                bodyText.append(Character(UnicodeScalar(byte)))
                count += 1
                if count > 2000 { break }
            }
            throw LLMError.httpStatus(http.statusCode, bodyText)
        }

        let parser = SSEStreamParser()
        var pending: [UInt8] = []
        for try await byte in bytes {
            try Task.checkCancellation()
            pending.append(byte)
            // 按原始字节累积，收到 \n\n 或 \r\n\r\n 时交给 parser
            if pending.count >= 2,
               (pending.suffix(2) == [0x0A, 0x0A]
                || (pending.count >= 4 && pending.suffix(4) == [0x0D, 0x0A, 0x0D, 0x0A])) {
                if let chunk = String(bytes: pending, encoding: .utf8) {
                    for event in parser.append(chunk) {
                        switch event {
                        case .done:
                            return
                        case .data(let payload):
                            if let delta = Self.extractDelta(from: payload) {
                                onDelta(delta)
                            }
                        }
                    }
                }
                pending.removeAll(keepingCapacity: true)
            }
        }
        // 流结束兜底：把残余字节塞进 parser
        if !pending.isEmpty, let chunk = String(bytes: pending, encoding: .utf8) {
            for event in parser.append(chunk) + parser.flush() {
                if case .data(let payload) = event, let delta = Self.extractDelta(from: payload) {
                    onDelta(delta)
                }
            }
        } else {
            for event in parser.flush() {
                if case .data(let payload) = event, let delta = Self.extractDelta(from: payload) {
                    onDelta(delta)
                }
            }
        }
    }

    /// 从 OpenAI 流式响应的一条 data JSON 中取出 choices[0].delta.content。
    static func extractDelta(from json: String) -> String? {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = obj["choices"] as? [[String: Any]],
              let first = choices.first
        else {
            return nil
        }
        if let delta = first["delta"] as? [String: Any], let content = delta["content"] as? String {
            return content
        }
        // 也兼容非流式：choices[0].message.content
        if let message = first["message"] as? [String: Any], let content = message["content"] as? String {
            return content
        }
        return nil
    }
}

// MARK: - SSE 逐行解析需要的 URLSession bytes.lines 支持来自 Foundation。
