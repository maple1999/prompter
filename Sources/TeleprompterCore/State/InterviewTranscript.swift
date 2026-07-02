import Foundation

/// 面试记录的单条 Q&A。
public struct InterviewTranscriptEntry: Sendable {
    public let question: String
    public let answer: String
    public let timestamp: Date

    public init(question: String, answer: String, timestamp: Date = Date()) {
        self.question = question
        self.answer = answer
        self.timestamp = timestamp
    }
}

/// 面试会话的完整对话记录。在 InterviewSessionCoordinator 中累积，供导出和构建多轮上下文。
public final class InterviewTranscript: @unchecked Sendable {
    public private(set) var entries: [InterviewTranscriptEntry] = []
    public let startTime: Date

    public init() {
        startTime = Date()
    }

    public var isEmpty: Bool { entries.isEmpty }

    /// 追加一轮 Q&A。
    public func append(question: String, answer: String) {
        entries.append(InterviewTranscriptEntry(question: question, answer: answer))
    }

    /// 构建用于 LLM 多轮对话的 messages 数组（不含 system prompt，不含当前问题）。
    public func chatMessages() -> [[String: String]] {
        var messages: [[String: String]] = []
        for entry in entries {
            messages.append(["role": "user", "content": entry.question])
            messages.append(["role": "assistant", "content": entry.answer])
        }
        return messages
    }

    /// 导出为 Markdown 格式的面试记录。
    public func exportMarkdown() -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"

        let headerDateFormatter = DateFormatter()
        headerDateFormatter.dateFormat = "yyyy-MM-dd HH:mm"

        var md = "# 面试记录\n\n"
        md += "**开始时间**：\(headerDateFormatter.string(from: startTime))\n\n"
        md += "---\n\n"

        if entries.isEmpty {
            md += "_暂无记录_\n"
            return md
        }

        for (i, entry) in entries.enumerated() {
            md += "## 第 \(i + 1) 题\n\n"
            md += "**时间**：\(dateFormatter.string(from: entry.timestamp))\n\n"
            md += "### 面试官提问\n\n"
            md += "\(entry.question)\n\n"
            md += "### 参考回答\n\n"
            md += "\(entry.answer)\n\n"
            if i < entries.count - 1 {
                md += "---\n\n"
            }
        }

        return md
    }
}
