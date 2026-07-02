import Foundation
import AVFoundation
import Speech
import TeleprompterCore

/// 面试模式会话协调器。
///
/// 阶段 A：监听面试官提问（系统音频 → ASR），VAD 静音超阈值或快捷键结束问题；
/// 阶段 B：把问题喂给 LLM，流式拿回答（UI 先显示 thinking，收到首 token 后切 teleprompter 同步流式展示）；
/// 阶段 C：LLM 结束后，启动麦克风 + ReadingTracker 追踪用户朗读；
/// 阶段 D：autoHide 秒数无语音后自动回到 .listening 等下一题。
@MainActor
final class InterviewSessionCoordinator {
    private weak var state: AppState?

    private var systemTap: Any?                   // SystemAudioTap 13+
    private let mic = MicAudioTap()
    private var questionRecognizer: SpeechRecognizer?
    private var readingRecognizer: SpeechRecognizer?
    private var tracker: ReadingTracker?
    private var llmClient: LLMClient?

    private var questionVAD: VAD?
    private var autoHide: AutoHideTimer?

    private var questionText: String = ""
    private var questionStreamTask: Task<Void, Never>?
    private var readingStreamTask: Task<Void, Never>?
    private var readingSetupTask: Task<Void, Never>?
    private var llmTask: Task<Void, Never>?

    private var isStopped = false

    /// 面试会话的对话记录，同时用于构建多轮上下文和导出。
    private let transcript = InterviewTranscript()

    init(state: AppState) {
        self.state = state
        state.interviewTranscript = transcript
    }

    func startListening() async {
        guard let state, !isStopped else { return }

        // 一次性把 speech + mic 权限都申请掉，避免阶段 C 才弹麦克风权限框打断面试。
        let speechAuth = await SpeechRecognizer.requestAuthorization()
        guard speechAuth == .authorized else {
            state.showError("未授予语音识别权限"); return
        }
        let micOK = await MicAudioTap.requestAuthorization()
        guard micOK else {
            state.showError("未授予麦克风权限"); return
        }

        guard !isStopped else { return }

        state.islandState = .listening("")
        questionText = ""

        let recognizer = SpeechRecognizer(
            locale: Locale(identifier: state.preferences.language.rawValue),
            requiresOnDevice: true
        )
        self.questionRecognizer = recognizer

        let vadThreshold = max(1.0, state.preferences.interviewVADSilence)
        let vad = VAD(silenceThreshold: vadThreshold) { [weak self] in
            Task { @MainActor in self?.finalizeQuestion() }
        }
        self.questionVAD = vad

        let stream: AsyncStream<TranscriptionUpdate>
        do {
            stream = try recognizer.start()
        } catch {
            state.showError("启动语音识别失败：\(error.localizedDescription)")
            stop(collapseTo: .compact)
            return
        }

        do {
            if #available(macOS 14.4, *) {
                let tap = SystemAudioTap()
                self.systemTap = tap
                try await tap.start { [weak recognizer] buffer in
                    recognizer?.append(buffer)
                }
            } else {
                throw NSError(domain: "interview", code: -1, userInfo: [NSLocalizedDescriptionKey: "需要 macOS 14.4+"])
            }
        } catch {
            state.showError("启动系统音频失败：\(error.localizedDescription)")
            stop(collapseTo: .compact)
            return
        }

        questionStreamTask = Task { [weak self, weak vad] in
            for await update in stream {
                guard !Task.isCancelled else { return }
                vad?.reportVoice()
                await MainActor.run {
                    guard let self, !self.isStopped else { return }
                    self.questionText = update.text
                    // 实时把累积识别文本推到 islandState 关联值，UI 跟随显示
                    if case .listening = self.state?.islandState {
                        self.state?.islandState = .listening(update.text)
                    }
                }
            }
        }
    }

    /// 由 VAD 或用户快捷键触发。
    func finalizeQuestion() {
        guard let state, !isStopped else { return }
        guard case .listening = state.islandState else { return }

        questionVAD?.cancel()
        questionStreamTask?.cancel()
        questionStreamTask = nil
        questionRecognizer?.stop()
        questionRecognizer = nil
        if #available(macOS 14.4, *), let tap = systemTap as? SystemAudioTap {
            Task { await tap.stop() }
        }
        systemTap = nil

        let q = questionText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            // 没识别到内容：直接回 listening 等下一题，而不是跌成 .compact 打断面试循环。
            Task { await self.startListening() }
            return
        }

        state.islandState = .thinking
        llmTask = Task { [weak self] in
            await self?.callLLM(question: q)
        }
    }

    private func callLLM(question: String) async {
        guard let state, !isStopped else { return }
        guard let baseURL = URL(string: state.preferences.baseURL), !state.preferences.apiKey.isEmpty else {
            state.showError("请先在「设置 → LLM」配置 baseURL 和 API Key")
            return
        }
        var fullSystemPrompt = state.preferences.systemPrompt
        let resume = state.preferences.resumeText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !resume.isEmpty {
            fullSystemPrompt += "\n\n---\n以下是我的个人简历，请参考简历内容作答：\n\n" + resume
        }

        let cfg = LLMConfig(
            baseURL: baseURL,
            apiKey: state.preferences.apiKey,
            model: state.preferences.model,
            systemPrompt: fullSystemPrompt,
            maxTokens: state.preferences.maxTokens,
            temperature: state.preferences.temperature
        )
        let client = LLMClient(config: cfg)
        self.llmClient = client

        var accumulated = ""
        do {
            // 用 streamChat 传入历史 Q&A + 当前问题，让 LLM 感知多轮上下文
            var chatMessages = transcript.chatMessages()
            chatMessages.append(["role": "user", "content": question])
            for try await chunk in client.streamChat(messages: chatMessages) {
                if Task.isCancelled || isStopped { return }
                accumulated += chunk
                await MainActor.run {
                    self.updateStreamingAnswer(accumulated)
                }
            }
        } catch is CancellationError {
            // 用户主动停止或切流，不弹错误
            return
        } catch {
            // CancellationError 包装在 LLMError.network 之类里时也尝试识别
            let nsErr = error as NSError
            if nsErr.domain == NSURLErrorDomain && nsErr.code == NSURLErrorCancelled {
                return
            }
            await MainActor.run {
                state.showError("LLM 请求失败：\(error.localizedDescription)")
            }
            return
        }

        if isStopped { return }

        let trimmed = accumulated.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            // LLM 没吐任何 token：UI 不能卡在 thinking。回 listening 等下一题。
            await MainActor.run {
                self.state?.showError("LLM 没有返回内容")
                Task { await self.startListening() }
            }
            return
        }

        await MainActor.run {
            // 记录本轮 Q&A 到 transcript（供多轮上下文和导出）
            self.transcript.append(question: question, answer: accumulated)
            self.startReadingTracking(answer: accumulated)
        }
    }

    /// 流式过程中实时更新 teleprompter 视图（此时 tracker 还没启用，所有 token 都是 unread）。
    private func updateStreamingAnswer(_ text: String) {
        guard let state else { return }
        let tokens = TokenNormalizer.tokenize(text)
        let payload = TeleprompterPayload(
            tokens: tokens.map(\.normalized),
            displayTokens: tokens.map(\.display),
            statuses: Array(repeating: .unread, count: tokens.count),
            cursor: 0
        )
        state.teleprompterPayload = payload
        state.islandState = .teleprompter(payload)
    }

    /// LLM 拿到完整回答后启动朗读追踪。
    private func startReadingTracking(answer: String) {
        guard let state, !isStopped else { return }
        let tokens = TokenNormalizer.tokenize(answer)
        let tracker = ReadingTracker(reference: tokens)
        self.tracker = tracker

        let recognizer = SpeechRecognizer(
            locale: Locale(identifier: state.preferences.language.rawValue),
            requiresOnDevice: true
        )
        self.readingRecognizer = recognizer

        let autoHide = AutoHideTimer(interval: TimeInterval(state.preferences.autoHideSeconds)) { [weak self] in
            Task { @MainActor in self?.readingTimeout() }
        }
        self.autoHide = autoHide

        // 阶段 A 已经申请过 mic 权限，这里可以同步启动；但 readingSetupTask 仍要 track，
        // 才能在 mic.start 真正执行前若被 stop() 也能安全短路。
        readingSetupTask = Task { [weak self] in
            guard let self, !self.isStopped else { return }
            do {
                let stream = try recognizer.start()
                if self.isStopped {
                    recognizer.stop()
                    return
                }
                try self.mic.start { [weak recognizer] buffer in
                    recognizer?.append(buffer)
                }
                if self.isStopped {
                    self.mic.stop()
                    recognizer.stop()
                    return
                }
                autoHide.start()

                self.readingStreamTask = Task { [weak self, weak tracker, weak autoHide] in
                    for await update in stream {
                        guard !Task.isCancelled, let self, let tracker else { return }
                        autoHide?.pet()
                        let payload = tracker.ingest(transcript: update.text)
                        await MainActor.run {
                            self.state?.teleprompterPayload = payload
                            self.state?.islandState = .teleprompter(payload)
                        }
                    }
                }
            } catch {
                self.mic.stop()
                recognizer.stop()
                self.readingRecognizer = nil
                autoHide.stop()
                self.autoHide = nil
                await MainActor.run {
                    self.state?.showError("启动麦克风失败：\(error.localizedDescription)")
                }
            }
        }
    }

    private func readingTimeout() {
        guard !isStopped else { return }
        mic.stop()
        readingRecognizer?.stop()
        readingRecognizer = nil
        readingStreamTask?.cancel()
        readingStreamTask = nil
        readingSetupTask?.cancel()
        readingSetupTask = nil
        autoHide?.stop()
        autoHide = nil
        tracker = nil
        state?.teleprompterPayload = nil
        // 回到 listening 等下一题
        Task { await startListening() }
    }

    func stop(collapseTo next: IslandState? = nil) {
        isStopped = true

        questionVAD?.cancel()
        questionStreamTask?.cancel()
        readingStreamTask?.cancel()
        readingSetupTask?.cancel()
        llmTask?.cancel()

        questionRecognizer?.stop()
        readingRecognizer?.stop()
        mic.stop()
        if #available(macOS 14.4, *), let tap = systemTap as? SystemAudioTap {
            Task { await tap.stop() }
        }
        systemTap = nil
        autoHide?.stop()

        questionStreamTask = nil
        readingStreamTask = nil
        readingSetupTask = nil
        llmTask = nil
        questionRecognizer = nil
        readingRecognizer = nil
        autoHide = nil
        questionVAD = nil
        llmClient = nil
        tracker = nil
        state?.teleprompterPayload = nil
        if let next { state?.islandState = next }
    }
}
