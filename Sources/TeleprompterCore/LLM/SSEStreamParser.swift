import Foundation

/// 将 SSE (Server-Sent Events) 字节流解析为逻辑事件。
///
/// OpenAI 风格：每个事件是由空行分隔的文本块，内部以 "data: " 为前缀。
/// 特殊事件 "data: [DONE]" 表示流结束。
public final class SSEStreamParser {
    private var buffer = ""

    public init() {}

    public enum Event: Equatable {
        case data(String)   // 一条 data 事件的有效负载（可能是 JSON）
        case done           // [DONE] 哨兵
    }

    /// 追加一段新字节，返回能解析出的完整事件列表。
    public func append(_ chunk: String) -> [Event] {
        buffer.append(chunk)
        var events: [Event] = []
        while let range = buffer.range(of: "\n\n") ?? buffer.range(of: "\r\n\r\n") {
            let block = String(buffer[..<range.lowerBound])
            buffer.removeSubrange(..<range.upperBound)
            if let event = parseBlock(block) {
                events.append(event)
            }
        }
        return events
    }

    /// 结束后冲刷残留 buffer（非必需，多数 SSE 以空行结束流）。
    public func flush() -> [Event] {
        guard !buffer.isEmpty else { return [] }
        let block = buffer
        buffer.removeAll()
        return parseBlock(block).map { [$0] } ?? []
    }

    private func parseBlock(_ block: String) -> Event? {
        for rawLine in block.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : String(rawLine)
            if line.hasPrefix(":") { continue }                   // SSE 注释
            if !line.hasPrefix("data:") { continue }
            var payload = String(line.dropFirst("data:".count))
            if payload.hasPrefix(" ") { payload.removeFirst() }
            if payload == "[DONE]" { return .done }
            return .data(payload)
        }
        return nil
    }
}
