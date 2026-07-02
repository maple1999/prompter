import Foundation

public enum SpeechLanguage: String, Codable, Sendable, CaseIterable {
    case zhCN = "zh-CN"
    case enUS = "en-US"

    public var displayName: String {
        switch self {
        case .zhCN: return "中文（普通话）"
        case .enUS: return "English"
        }
    }
}

public enum ScreenCaptureMode: String, Codable, Sendable, CaseIterable {
    case interactive   // 系统原生十字光标拖框选区
    case fullScreen    // 静音全屏
}

/// 笔试助手快捷键预设。提供 `keyCode` + `modifiers` 给 HotkeyManager 直接注册。
/// 用预设而非自由按键录入是因为后者要单独写 NSEvent 监视器 UI，不在本期范围。
public enum QuizHotkeyPreset: String, Codable, Sendable, CaseIterable {
    case ctrlOptQ
    case cmdOptQ
    case cmdShiftA
    case disabled

    public var displayName: String {
        switch self {
        case .ctrlOptQ:  return "⌃⌥ Q"
        case .cmdOptQ:   return "⌘⌥ Q"
        case .cmdShiftA: return "⌘⇧ A"
        case .disabled:  return "不绑定"
        }
    }
}

/// UserDefaults 封装。API key 不进 UserDefaults，走 KeychainStore。
public final class Preferences: @unchecked Sendable {
    public static let shared = Preferences()

    private let defaults: UserDefaults
    private let suiteName = "com.openteleprompter.prefs"

    public init(defaults: UserDefaults? = nil) {
        self.defaults = defaults ?? UserDefaults(suiteName: "com.openteleprompter.prefs") ?? .standard
    }

    private enum Keys {
        static let baseURL = "llm.baseURL"
        static let model = "llm.model"
        static let systemPrompt = "llm.systemPrompt"
        static let maxTokens = "llm.maxTokens"
        static let temperature = "llm.temperature"
        static let provider = "llm.provider"
        static let language = "speech.language"
        static let autoHideSeconds = "island.autoHideSeconds"
        static let teleprompterLines = "island.teleprompterLines"
        static let hideFromScreenShare = "island.hideFromScreenShare"
        static let script = "meeting.script"
        static let interviewVADSilence = "interview.vadSilence"
        static let quizSystemPrompt = "quiz.systemPrompt"
        static let screenshotMode = "quiz.screenshotMode"
        static let quizHotkeyPreset = "quiz.hotkeyPreset"
        static let resumeText = "resume.text"
        static let resumeFileName = "resume.fileName"
    }

    public var llmBaseURL: String {
        get { defaults.string(forKey: Keys.baseURL) ?? "https://api.openai.com" }
        set { defaults.set(newValue, forKey: Keys.baseURL) }
    }

    public var llmModel: String {
        get { defaults.string(forKey: Keys.model) ?? "gpt-4o-mini" }
        set { defaults.set(newValue, forKey: Keys.model) }
    }

    public var llmSystemPrompt: String {
        get {
            defaults.string(forKey: Keys.systemPrompt)
                ?? """
                你是正在参加面试的候选人。听到面试官的问题后，用第一人称、口语化、流畅自然的语气直接回答。

                - 不重复问题、不寒暄；不要用 markdown / 列表 / 编号——你说的话会被人念出来。
                - 用短句，控制在 200~300 字，最多两段。
                - 行为或经历类问题给出具体的项目、动作和数字，避免泛泛而谈。
                - 技术问题先给出关键判断或选型，再用一两句解释为什么。
                - 问题模糊时按最常见解读回答，不反问。
                """
        }
        set { defaults.set(newValue, forKey: Keys.systemPrompt) }
    }

    public var llmMaxTokens: Int {
        get {
            let v = defaults.integer(forKey: Keys.maxTokens)
            return v == 0 ? 500 : v
        }
        set { defaults.set(newValue, forKey: Keys.maxTokens) }
    }

    public var llmTemperature: Double {
        get {
            let v = defaults.double(forKey: Keys.temperature)
            return v == 0 ? 0.7 : v
        }
        set { defaults.set(newValue, forKey: Keys.temperature) }
    }

    /// LLM 服务商预设。`.custom` 为缺省值（向后兼容老用户已填的 baseURL/model）。
    public var llmProvider: LLMProvider {
        get {
            LLMProvider(rawValue: defaults.string(forKey: Keys.provider) ?? "") ?? .custom
        }
        set { defaults.set(newValue.rawValue, forKey: Keys.provider) }
    }

    public var speechLanguage: SpeechLanguage {
        get { SpeechLanguage(rawValue: defaults.string(forKey: Keys.language) ?? "") ?? .zhCN }
        set { defaults.set(newValue.rawValue, forKey: Keys.language) }
    }

    public var autoHideSeconds: Int {
        get {
            let v = defaults.integer(forKey: Keys.autoHideSeconds)
            return v == 0 ? 10 : v
        }
        set { defaults.set(newValue, forKey: Keys.autoHideSeconds) }
    }

    /// 提词器展开时显示的行数（1~3）。
    public var teleprompterLines: Int {
        get {
            let v = defaults.integer(forKey: Keys.teleprompterLines)
            return v == 0 ? 1 : max(1, min(3, v))
        }
        set { defaults.set(max(1, min(3, newValue)), forKey: Keys.teleprompterLines) }
    }

    /// 共享屏幕 / 录屏时把提词面板从画面中排除（NSWindow.sharingType = .none）。默认开启。
    public var hideFromScreenShare: Bool {
        get {
            // UserDefaults.bool 对未设置键返回 false；这里想让默认值是 true。
            if defaults.object(forKey: Keys.hideFromScreenShare) == nil { return true }
            return defaults.bool(forKey: Keys.hideFromScreenShare)
        }
        set { defaults.set(newValue, forKey: Keys.hideFromScreenShare) }
    }

    public var meetingScript: String {
        get { defaults.string(forKey: Keys.script) ?? "" }
        set { defaults.set(newValue, forKey: Keys.script) }
    }

    /// 面试模式 VAD 静音判定阈值（秒）。面试官中途自然停顿常达 2 秒以上，
    /// 1.5 秒过激容易把一句问题切成两段；3 秒以上又显得迟钝。默认 2.8。
    public var interviewVADSilence: Double {
        get {
            let v = defaults.double(forKey: Keys.interviewVADSilence)
            return v == 0 ? 2.8 : v
        }
        set { defaults.set(newValue, forKey: Keys.interviewVADSilence) }
    }

    /// 笔试助手系统 prompt。要求严格 JSON 输出，便于客户端解析。
    public var quizSystemPrompt: String {
        get {
            defaults.string(forKey: Keys.quizSystemPrompt)
                ?? """
                你是笔试助手。看图后严格按这个 JSON 格式回复，不要 markdown 包裹：
                {"kind":"choice|fill|coding","answer":"...","language":"...","reasoning":"..."}

                - 选择题：answer 填字母如 "B"，reasoning ≤80 字
                - 填空题：answer 填最终值，reasoning ≤80 字
                - 编程题：answer 填完整可运行代码（含换行），language 填 "python"/"swift"/"go" 等，reasoning 含算法名 + 复杂度 + 关键点 ≤100 字
                - 不要复述题目，不要客套
                """
        }
        set { defaults.set(newValue, forKey: Keys.quizSystemPrompt) }
    }

    public var screenshotMode: ScreenCaptureMode {
        get { ScreenCaptureMode(rawValue: defaults.string(forKey: Keys.screenshotMode) ?? "") ?? .interactive }
        set { defaults.set(newValue.rawValue, forKey: Keys.screenshotMode) }
    }

    public var quizHotkeyPreset: QuizHotkeyPreset {
        get { QuizHotkeyPreset(rawValue: defaults.string(forKey: Keys.quizHotkeyPreset) ?? "") ?? .ctrlOptQ }
        set { defaults.set(newValue.rawValue, forKey: Keys.quizHotkeyPreset) }
    }

    /// 解析后的简历纯文本，面试模式注入 system prompt。
    public var resumeText: String {
        get { defaults.string(forKey: Keys.resumeText) ?? "" }
        set { defaults.set(newValue, forKey: Keys.resumeText) }
    }

    /// 上传的简历文件名（仅 UI 显示用）。
    public var resumeFileName: String {
        get { defaults.string(forKey: Keys.resumeFileName) ?? "" }
        set { defaults.set(newValue, forKey: Keys.resumeFileName) }
    }
}
