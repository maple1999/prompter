import Foundation

/// 笔试助手的答案 payload。
///
/// 与 `TeleprompterPayload` 共享 `.teleprompter` 状态：当 `AppState.quizAnswer` 非空时，
/// IslandRootView 渲染 `QuizAnswerView` 而不是 `TeleprompterView`。两条路在数据层完全独立。
public struct QuizAnswerPayload: Equatable, Sendable {
    public enum Kind: String, Sendable, Equatable {
        case choice    // 选择题
        case fill      // 填空题
        case coding    // 编程题
    }

    public let kind: Kind
    /// 选择题：字母选项（如 "B"）
    /// 填空题：最终值
    /// 编程题：完整代码（已写到剪贴板后此字段会被清空，避免泄漏到灵动岛）
    public let answer: String
    /// 简短思路，帮用户判断答案是否合理。≤100 字。
    public let reasoning: String
    /// 仅编程题为 true：表示代码已经写到 NSPasteboard，UI 显示 "✓ 已复制"。
    public let codeCopied: Bool

    public init(kind: Kind, answer: String, reasoning: String, codeCopied: Bool = false) {
        self.kind = kind
        self.answer = answer
        self.reasoning = reasoning
        self.codeCopied = codeCopied
    }
}
