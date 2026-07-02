import Foundation
import AppKit
import TeleprompterCore

/// 笔试助手会话协调器。端到端：截屏 → Vision LLM → JSON 解析 → 灵动岛展示。
///
/// 与 MeetingSessionCoordinator / InterviewSessionCoordinator 互斥
/// （AppDelegate.startQuiz 触发前会先 stopCurrent）。
@MainActor
final class QuizSessionCoordinator {
    private weak var state: AppState?
    private var llmTask: Task<Void, Never>?
    private var autoHide: AutoHideTimer?
    private var isStopped = false

    init(state: AppState) {
        self.state = state
    }

    func run() async {
        guard let state, !isStopped else { return }

        guard let baseURL = URL(string: state.preferences.baseURL), !state.preferences.apiKey.isEmpty else {
            state.showError("请先在「设置 → LLM」配置 baseURL 和 API Key")
            return
        }

        // 1. 截屏（用户拖框；可能 ESC 取消）
        let png: Data
        do {
            png = try await ScreenCapture.captureToClipboard(mode: state.preferences.screenshotMode)
        } catch ScreenCaptureError.userCancelled {
            state.islandState = .compact
            return
        } catch {
            state.showError("截屏失败：\(error.localizedDescription)")
            return
        }
        if isStopped { return }

        // 2. 进 thinking
        state.islandState = .thinking

        // 3. Vision LLM 流式调用，收完整字符串
        let cfg = LLMConfig(
            baseURL: baseURL,
            apiKey: state.preferences.apiKey,
            model: state.preferences.model,
            systemPrompt: state.preferences.quizSystemPrompt,
            // 编程题代码可能长，至少 800
            maxTokens: max(state.preferences.maxTokens, 800),
            // 笔试要稳，不发挥
            temperature: 0.2
        )
        let client = LLMClient(config: cfg)

        var accumulated = ""
        do {
            for try await chunk in client.streamVision(userPrompt: "请按系统 prompt 回答这张截图里的题目", imageData: png) {
                if Task.isCancelled || isStopped { return }
                accumulated += chunk
            }
        } catch is CancellationError {
            return
        } catch {
            let nsErr = error as NSError
            if nsErr.domain == NSURLErrorDomain && nsErr.code == NSURLErrorCancelled { return }
            state.showError("LLM 请求失败：\(error.localizedDescription)")
            return
        }
        if isStopped { return }

        // 4. 解析 JSON
        guard let payload = Self.parsePayload(from: accumulated) else {
            state.showError("LLM 返回不是合法 JSON：\(accumulated.prefix(80))")
            return
        }

        // 5. 编程题：把代码写到剪贴板，answer 字段清空避免泄漏到灵动岛
        let final: QuizAnswerPayload
        if payload.kind == .coding && !payload.answer.isEmpty {
            let pb = NSPasteboard.general
            pb.clearContents()
            pb.setString(payload.answer, forType: .string)
            final = QuizAnswerPayload(kind: .coding, answer: "", reasoning: payload.reasoning, codeCopied: true)
        } else {
            final = payload
        }

        // 6. 落到 island。state.islandState 推 .teleprompter（占位 payload），渲染端会因为 quizAnswer != nil 走 QuizAnswerView
        state.quizAnswer = final
        let placeholder = TeleprompterPayload(tokens: [], displayTokens: [], statuses: [], cursor: 0)
        state.teleprompterPayload = placeholder
        state.islandState = .teleprompter(placeholder)

        // 7. autoHideSeconds 后自动收回
        let autoHide = AutoHideTimer(interval: TimeInterval(state.preferences.autoHideSeconds)) { [weak self] in
            Task { @MainActor in self?.dismiss() }
        }
        self.autoHide = autoHide
        autoHide.start()
    }

    /// 容忍 markdown 代码块包裹（部分 LLM 即使 prompt 要求也会加）。
    static func parsePayload(from text: String) -> QuizAnswerPayload? {
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("```") {
            if let firstNewline = cleaned.firstIndex(of: "\n") {
                cleaned = String(cleaned[cleaned.index(after: firstNewline)...])
            }
            if cleaned.hasSuffix("```") {
                cleaned = String(cleaned.dropLast(3))
            }
            cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        guard let data = cleaned.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        let kindStr = (obj["kind"] as? String) ?? ""
        let kind: QuizAnswerPayload.Kind
        switch kindStr {
        case "choice": kind = .choice
        case "fill":   kind = .fill
        case "coding": kind = .coding
        default:       return nil
        }
        let answer = (obj["answer"] as? String) ?? ""
        let reasoning = (obj["reasoning"] as? String) ?? ""
        return QuizAnswerPayload(kind: kind, answer: answer, reasoning: reasoning, codeCopied: false)
    }

    private func dismiss() {
        guard !isStopped else { return }
        autoHide?.stop()
        autoHide = nil
        state?.quizAnswer = nil
        state?.teleprompterPayload = nil
        state?.islandState = .compact
    }

    func stop(collapseTo next: IslandState? = nil) {
        isStopped = true
        llmTask?.cancel()
        llmTask = nil
        autoHide?.stop()
        autoHide = nil
        state?.quizAnswer = nil
        if let next { state?.islandState = next }
    }
}
