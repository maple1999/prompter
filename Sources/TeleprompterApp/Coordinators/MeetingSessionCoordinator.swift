import Foundation
import AVFoundation
import Speech
import TeleprompterCore

/// 会议模式会话协调器。
///
/// 生命周期：
///   1. `start()`：加载稿件 → 建立 ReadingTracker → 申请麦克风/语音识别权限 → 启动 AVAudioEngine + SFSpeechRecognizer；
///   2. 每次 ASR partial → tracker.ingest → 更新 AppState.teleprompterPayload + islandState = .teleprompter；
///   3. AutoHideTimer 10 秒无语音 → 切 islandState = .compact、停止采音；
///   4. `stop()`：清理所有资源。
@MainActor
final class MeetingSessionCoordinator {
    private weak var state: AppState?
    private let mic = MicAudioTap()
    private var recognizer: SpeechRecognizer?
    private var tracker: ReadingTracker?
    private var autoHide: AutoHideTimer?
    private var transcriptionTask: Task<Void, Never>?

    init(state: AppState) {
        self.state = state
    }

    func start() async {
        guard let state else { return }
        let script = state.preferences.script
        let tokens = TokenNormalizer.tokenize(script)
        guard !tokens.isEmpty else {
            state.showError("请在「设置 → 会议稿件」粘贴需要朗读的文本")
            return
        }

        let authStatus = await SpeechRecognizer.requestAuthorization()
        guard authStatus == .authorized else {
            state.showError("未授予语音识别权限")
            return
        }
        let micAuthorized = await MicAudioTap.requestAuthorization()
        guard micAuthorized else {
            state.showError("未授予麦克风权限")
            return
        }

        let tracker = ReadingTracker(reference: tokens)
        self.tracker = tracker
        state.teleprompterPayload = makeInitialPayload(tokens: tokens)
        state.islandState = .teleprompter(state.teleprompterPayload!)

        let recognizer = SpeechRecognizer(
            locale: Locale(identifier: state.preferences.language.rawValue),
            requiresOnDevice: true
        )
        self.recognizer = recognizer

        let autoHide = AutoHideTimer(interval: TimeInterval(state.preferences.autoHideSeconds)) { [weak self] in
            Task { @MainActor in self?.stop(collapseTo: .compact) }
        }
        self.autoHide = autoHide

        do {
            let stream = try recognizer.start()
            try mic.start { [weak recognizer] buffer in
                recognizer?.append(buffer)
            }
            autoHide.start()

            transcriptionTask = Task { [weak self, weak tracker, weak autoHide] in
                for await update in stream {
                    guard !Task.isCancelled, let self, let tracker else { return }
                    // 只有 ASR 真的识别到了内容才算"有语音"，避免纯噪音或静音也重置倒计时
                    autoHide?.pet()
                    let payload = tracker.ingest(transcript: update.text)
                    await MainActor.run {
                        self.state?.teleprompterPayload = payload
                        self.state?.islandState = .teleprompter(payload)
                    }
                }
            }
        } catch {
            state.showError("启动失败：\(error.localizedDescription)")
            stop(collapseTo: .compact)
        }
    }

    func stop(collapseTo next: IslandState? = nil) {
        mic.stop()
        recognizer?.stop()
        recognizer = nil
        transcriptionTask?.cancel()
        transcriptionTask = nil
        autoHide?.stop()
        autoHide = nil
        if let next { state?.islandState = next }
    }

    private func makeInitialPayload(tokens: [Token]) -> TeleprompterPayload {
        TeleprompterPayload(
            tokens: tokens.map(\.normalized),
            displayTokens: tokens.map(\.display),
            statuses: Array(repeating: .unread, count: tokens.count),
            cursor: 0
        )
    }
}
