import Foundation

/// 一个 token 由两部分组成：
/// - normalized: 用于匹配的归一化形式（小写、去标点、中文逐字）
/// - display: 用于渲染的原始文本片段（保留标点/大小写/前后空白），拼接后还原原文
public struct Token: Equatable, Sendable, Hashable {
    public let normalized: String
    public let display: String

    public init(normalized: String, display: String) {
        self.normalized = normalized
        self.display = display
    }
}

/// 中英混合分词 + 归一化。
public enum TokenNormalizer {
    /// 将原文切分为 token 序列。所有 Token.display 拼接后近似等于原文。
    public static func tokenize(_ text: String) -> [Token] {
        var tokens: [Token] = []
        var pendingSeparator = ""         // 等待附加到下一个 token 前缀的空白/标点
        var englishNormalized = ""        // 英文/数字累积缓冲（小写）
        var englishDisplay = ""           // 对应的原文片段

        func flushEnglish() {
            guard !englishNormalized.isEmpty else { return }
            tokens.append(Token(
                normalized: englishNormalized,
                display: pendingSeparator + englishDisplay
            ))
            englishNormalized = ""
            englishDisplay = ""
            pendingSeparator = ""
        }

        for ch in text {
            if isCJK(ch) {
                flushEnglish()
                tokens.append(Token(
                    normalized: String(ch),
                    display: pendingSeparator + String(ch)
                ))
                pendingSeparator = ""
            } else if ch.isLetter || ch.isNumber {
                englishNormalized.append(contentsOf: ch.lowercased())
                englishDisplay.append(ch)
            } else {
                // 分隔符：空白/标点/emoji 等
                if !englishNormalized.isEmpty {
                    flushEnglish()
                }
                pendingSeparator.append(ch)
            }
        }
        flushEnglish()
        // 尾部残留的分隔符：贴到最后一个 token 的 display 后面
        if !pendingSeparator.isEmpty, let last = tokens.last {
            tokens[tokens.count - 1] = Token(
                normalized: last.normalized,
                display: last.display + pendingSeparator
            )
        }
        return tokens
    }

    /// 判断是否为 CJK 表意文字（中文 / 日文汉字 / 韩文汉字）。
    static func isCJK(_ ch: Character) -> Bool {
        for scalar in ch.unicodeScalars {
            let v = scalar.value
            if (0x4E00...0x9FFF).contains(v)        // CJK Unified Ideographs
                || (0x3400...0x4DBF).contains(v)    // CJK Unified Ideographs Extension A
                || (0x20000...0x2A6DF).contains(v)  // CJK Unified Ideographs Extension B
                || (0xF900...0xFAFF).contains(v)    // CJK Compatibility Ideographs
                || (0x3040...0x309F).contains(v)    // Hiragana
                || (0x30A0...0x30FF).contains(v)    // Katakana
            {
                return true
            }
        }
        return false
    }
}
