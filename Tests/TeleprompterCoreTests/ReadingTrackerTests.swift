import Testing
@testable import TeleprompterCore

@Suite("ReadingTracker")
struct ReadingTrackerTests {
    private func makeChineseTracker() -> ReadingTracker {
        // "今天天气很好我们出去走走吧" → 13 个字
        let script = "今天天气很好我们出去走走吧"
        let tokens = TokenNormalizer.tokenize(script)
        return ReadingTracker(reference: tokens, tailLength: 6)
    }

    @Test func sequentialReading() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "今天天气")
        #expect(tracker.currentCursor >= 3 && tracker.currentCursor <= 4)

        _ = tracker.ingest(transcript: "今天天气很好")
        #expect(tracker.currentCursor == 6)

        let payload = tracker.ingest(transcript: "今天天气很好我们出去走走吧")
        #expect(tracker.currentCursor == payload.tokens.count)
        let prefix = payload.statuses.prefix(payload.tokens.count)
        #expect(prefix.allSatisfy { $0 == .matched })
    }

    @Test func skipForward() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "今天天气")
        let payload = tracker.ingest(transcript: "今天天气我们出去走走吧")
        // "很好"（索引 4, 5）应被标为 skipped
        #expect(payload.statuses[4] == .skipped)
        #expect(payload.statuses[5] == .skipped)
        #expect(payload.statuses.last == .matched)
    }

    @Test func rewind() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "今天天气很好我们出去")
        let midCursor = tracker.currentCursor
        #expect(midCursor > 6)

        _ = tracker.ingest(transcript: "今天天气很好我们出去今天天气")
        #expect(tracker.currentCursor < midCursor)
    }

    @Test func idempotentOnRepeat() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "今天天气很好")
        let c1 = tracker.currentCursor
        _ = tracker.ingest(transcript: "今天天气很好")
        #expect(tracker.currentCursor == c1)
    }

    @Test func asrSubstitutionTolerance() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "今天天气很好我们处去")
        #expect(tracker.currentCursor >= 8)
    }

    @Test func englishScript() {
        let script = "Hello world this is a test sentence for the teleprompter"
        let tracker = ReadingTracker(reference: TokenNormalizer.tokenize(script), tailLength: 6)
        _ = tracker.ingest(transcript: "Hello world this is")
        #expect(tracker.currentCursor == 4)

        _ = tracker.ingest(transcript: "Hello world this is a test sentence")
        #expect(tracker.currentCursor == 7)
    }

    @Test func mixedLanguageScript() {
        let script = "使用 SwiftUI 构建原生应用"
        let tracker = ReadingTracker(reference: TokenNormalizer.tokenize(script), tailLength: 6)
        _ = tracker.ingest(transcript: "使用 swiftui 构建")
        #expect(tracker.currentCursor >= 4)
    }

    @Test func lowConfidenceDoesNotAdvance() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "abcdefghijklmno")
        #expect(tracker.currentCursor == 0)
    }

    @Test func emptyReference() {
        let tracker = ReadingTracker(reference: [], tailLength: 6)
        let payload = tracker.ingest(transcript: "anything")
        #expect(payload.tokens.isEmpty)
        #expect(tracker.currentCursor == 0)
    }

    @Test func emptyTranscript() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "")
        #expect(tracker.currentCursor == 0)
    }

    @Test func reset() {
        let tracker = makeChineseTracker()
        _ = tracker.ingest(transcript: "今天天气很好")
        #expect(tracker.currentCursor > 0)
        tracker.reset()
        #expect(tracker.currentCursor == 0)
        #expect(tracker.currentStatuses.allSatisfy { $0 == .unread })
    }
}
