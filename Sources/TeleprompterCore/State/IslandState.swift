import Foundation

/// 灵动岛的顶层状态机。
public enum IslandState: Equatable, Sendable {
    case hidden
    case compact
    case expanded
    case listening(String)            // 面试：监听面试官提问；关联值是当前 ASR 累积识别文本
    case thinking                     // 面试：等待 LLM 回答
    case teleprompter(TeleprompterPayload)
    case error(String)
}

public struct TeleprompterPayload: Equatable, Sendable {
    public var tokens: [String]       // 归一化后的 token 序列
    public var displayTokens: [String] // 原始显示文本（保留标点/大小写）
    public var statuses: [TokenStatus]
    public var cursor: Int             // 下一个待念 token 的索引

    public init(tokens: [String], displayTokens: [String], statuses: [TokenStatus], cursor: Int) {
        self.tokens = tokens
        self.displayTokens = displayTokens
        self.statuses = statuses
        self.cursor = cursor
    }
}

public enum TokenStatus: Equatable, Sendable {
    case unread
    case matched
    case skipped
}
