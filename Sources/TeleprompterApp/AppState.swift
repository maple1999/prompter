import Foundation
import SwiftUI
import TeleprompterCore

/// 全局 UI 状态。SwiftUI 视图通过 EnvironmentObject 观察。
@MainActor
final class AppState: ObservableObject {
    @Published var islandState: IslandState = .compact
    @Published var sessionMode: SessionMode = .meeting

    // 提词器 payload（场景 1：用户提供；场景 2：LLM 生成）
    @Published var teleprompterPayload: TeleprompterPayload?

    // 笔试答案 payload。当非空且 islandState == .teleprompter 时，渲染 QuizAnswerView 替代 TeleprompterView。
    @Published var quizAnswer: QuizAnswerPayload?

    // 设置项（从 Preferences 装载）
    @Published var preferences: PreferencesViewModel = PreferencesViewModel()

    // 错误信息（用于 .error 态显示）
    @Published var lastError: String?

    // 面试记录。Coordinator 创建时写入，停止后保留供导出。
    @Published var interviewTranscript: InterviewTranscript?

    init() {
        loadPreferences()
    }

    func setMode(_ mode: SessionMode) {
        sessionMode = mode
        islandState = .compact
    }

    func showError(_ message: String) {
        lastError = message
        islandState = .error(message)
    }

    func loadPreferences() {
        let p = Preferences.shared
        preferences = PreferencesViewModel(
            baseURL: p.llmBaseURL,
            apiKey: KeychainStore.get() ?? "",
            model: p.llmModel,
            systemPrompt: p.llmSystemPrompt,
            maxTokens: p.llmMaxTokens,
            temperature: p.llmTemperature,
            provider: p.llmProvider,
            language: p.speechLanguage,
            autoHideSeconds: p.autoHideSeconds,
            teleprompterLines: p.teleprompterLines,
            hideFromScreenShare: p.hideFromScreenShare,
            script: p.meetingScript,
            interviewVADSilence: p.interviewVADSilence,
            quizSystemPrompt: p.quizSystemPrompt,
            screenshotMode: p.screenshotMode,
            quizHotkeyPreset: p.quizHotkeyPreset,
            resumeText: p.resumeText,
            resumeFileName: p.resumeFileName
        )
    }

    func savePreferences() {
        let p = Preferences.shared
        p.llmBaseURL = preferences.baseURL
        p.llmModel = preferences.model
        p.llmSystemPrompt = preferences.systemPrompt
        p.llmMaxTokens = preferences.maxTokens
        p.llmTemperature = preferences.temperature
        p.llmProvider = preferences.provider
        p.speechLanguage = preferences.language
        p.autoHideSeconds = preferences.autoHideSeconds
        p.teleprompterLines = preferences.teleprompterLines
        p.hideFromScreenShare = preferences.hideFromScreenShare
        p.meetingScript = preferences.script
        p.interviewVADSilence = preferences.interviewVADSilence
        p.quizSystemPrompt = preferences.quizSystemPrompt
        p.screenshotMode = preferences.screenshotMode
        p.quizHotkeyPreset = preferences.quizHotkeyPreset
        p.resumeText = preferences.resumeText
        p.resumeFileName = preferences.resumeFileName
        try? KeychainStore.set(preferences.apiKey)
    }
}

struct PreferencesViewModel {
    var baseURL: String = "https://api.openai.com"
    var apiKey: String = ""
    var model: String = "gpt-4o-mini"
    var systemPrompt: String = ""
    var maxTokens: Int = 500
    var temperature: Double = 0.7
    var provider: LLMProvider = .custom
    var language: SpeechLanguage = .zhCN
    var autoHideSeconds: Int = 10
    var teleprompterLines: Int = 1
    var hideFromScreenShare: Bool = true
    var script: String = ""
    var interviewVADSilence: Double = 2.8
    var quizSystemPrompt: String = ""
    var screenshotMode: ScreenCaptureMode = .interactive
    var quizHotkeyPreset: QuizHotkeyPreset = .ctrlOptQ
    var resumeText: String = ""
    var resumeFileName: String = ""
}
