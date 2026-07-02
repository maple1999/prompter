import Testing
@testable import TeleprompterCore

@Suite("TokenNormalizer")
struct TokenNormalizerTests {
    @Test func pureChinese() {
        let t = TokenNormalizer.tokenize("你好世界")
        #expect(t.map(\.normalized) == ["你", "好", "世", "界"])
        #expect(t.map(\.display).joined() == "你好世界")
    }

    @Test func chineseWithPunctuation() {
        let t = TokenNormalizer.tokenize("你好，世界！")
        #expect(t.map(\.normalized) == ["你", "好", "世", "界"])
        #expect(t.map(\.display).joined() == "你好，世界！")
    }

    @Test func pureEnglish() {
        let t = TokenNormalizer.tokenize("Hello, World!")
        #expect(t.map(\.normalized) == ["hello", "world"])
        #expect(t.map(\.display).joined() == "Hello, World!")
    }

    @Test func mixedChineseEnglish() {
        let t = TokenNormalizer.tokenize("你好 world 中国")
        #expect(t.map(\.normalized) == ["你", "好", "world", "中", "国"])
        #expect(t.map(\.display).joined() == "你好 world 中国")
    }

    @Test func numbersStayAsSingleToken() {
        let t = TokenNormalizer.tokenize("in 2024 year")
        #expect(t.map(\.normalized) == ["in", "2024", "year"])
    }

    @Test func leadingWhitespace() {
        let t = TokenNormalizer.tokenize("  start")
        #expect(t.map(\.normalized) == ["start"])
        #expect(t.map(\.display).joined() == "  start")
    }

    @Test func trailingPunctuation() {
        let t = TokenNormalizer.tokenize("end!")
        #expect(t.map(\.normalized) == ["end"])
        #expect(t.map(\.display).joined() == "end!")
    }

    @Test func emptyInput() {
        #expect(TokenNormalizer.tokenize("").isEmpty)
    }

    @Test func whitespaceOnly() {
        #expect(TokenNormalizer.tokenize("   \n\t  ").isEmpty)
    }

    @Test func caseNormalization() {
        let t = TokenNormalizer.tokenize("HELLO hello HeLLo")
        #expect(t.map(\.normalized) == ["hello", "hello", "hello"])
        #expect(t[0].display.contains("HELLO"))
        #expect(t[2].display.contains("HeLLo"))
    }

    @Test("Roundtrip preserves original text", arguments: [
        "Hello, World!",
        "你好，世界！",
        "Mixed 中英 text with 标点！",
        "  leading and trailing  ",
        "2024年12月31日",
    ])
    func roundtrip(_ original: String) {
        let reconstructed = TokenNormalizer.tokenize(original).map(\.display).joined()
        #expect(reconstructed == original)
    }
}
