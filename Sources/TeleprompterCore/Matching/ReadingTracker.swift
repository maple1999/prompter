import Foundation

/// 跳读鲁棒的朗读追踪器。
///
/// 使用方式：
///   1. 用提词稿的 tokens 初始化；
///   2. 每次 ASR partial transcript 变化时调用 `ingest(transcript:)`；
///   3. 返回的 `TeleprompterPayload` 给 UI 渲染。
///
/// 策略：
///   - 用 `lastObservedTokenCount` 跟踪 ASR 累积文本的 token 数，每次更新得到增量 `deltaCount`；
///   - 把最近 max(tailLength, deltaCount+2) 个 token 作为"指纹"，在
///     `[cursor - searchBack, cursor + searchAhead)` 区间用 `FuzzyMatcher` 找最佳对齐；
///   - 若置信度 ≥ `confidenceThreshold`，更新 cursor；
///   - 推进时，matched 区间 = 最近 `deltaCount` 个 token，前面的标为 `.skipped`；
///   - 置信度不足则不改 cursor；
///   - 允许回退（用户回读），并把撤销区间恢复为 `.unread`。
public final class ReadingTracker {
    // 参考序列
    private let reference: [String]
    private let displayReference: [String]

    // 运行态
    private var statuses: [TokenStatus]
    private var cursor: Int = 0
    private var lastObservedTokenCount: Int = 0

    // 参数
    public let confidenceThreshold: Double
    public let tailLength: Int
    public let searchAhead: Int
    public let searchBack: Int

    public init(
        reference: [Token],
        confidenceThreshold: Double = 0.55,
        tailLength: Int = 6,
        searchAhead: Int = 40,
        searchBack: Int = 30
    ) {
        self.reference = reference.map { $0.normalized }
        self.displayReference = reference.map { $0.display }
        self.statuses = Array(repeating: .unread, count: reference.count)
        self.confidenceThreshold = confidenceThreshold
        self.tailLength = tailLength
        self.searchAhead = searchAhead
        self.searchBack = searchBack
    }

    public var currentCursor: Int { cursor }
    public var currentStatuses: [TokenStatus] { statuses }

    /// 接收一次 ASR 累积 transcript（完整 partial text），更新状态。
    @discardableResult
    public func ingest(transcript: String) -> TeleprompterPayload {
        guard !reference.isEmpty else { return snapshot() }

        let observedTokens = TokenNormalizer.tokenize(transcript).map { $0.normalized }
        guard !observedTokens.isEmpty else { return snapshot() }

        // 与上次相比新增了多少 token（ASR 修订可能收缩，此时视作 0）。
        let deltaCount = max(0, observedTokens.count - lastObservedTokenCount)
        lastObservedTokenCount = observedTokens.count

        // 尾段长度至少是 tailLength，但如果一次性新增了很多就扩大，让整段增量都能参与匹配。
        // 再额外多留几个旧 token 做上下文。
        let effectiveTail = min(observedTokens.count, max(tailLength, deltaCount + 2))
        let tail = Array(observedTokens.suffix(effectiveTail))

        let searchStart = max(0, cursor - searchBack)
        let searchEnd = min(reference.count, cursor + searchAhead)
        guard let align = FuzzyMatcher.bestAlignment(
            reference: reference,
            observedTail: tail,
            searchStart: searchStart,
            searchEnd: searchEnd
        ) else {
            return snapshot()
        }

        guard align.score >= confidenceThreshold else {
            return snapshot()
        }

        let newCursor = align.endIndex + 1

        if newCursor > cursor {
            // 向前推进。用 delta 的长度来判断"到底刚刚念了多少个 token"：
            //   - 若 deltaCount >= gap，用户刚在一次 update 内念完了整个 gap，全部 matched；
            //   - 若 deltaCount < gap，只有最近 deltaCount 个是 matched，前面是 skipped。
            let gap = newCursor - cursor
            // 首次观测（lastObservedTokenCount 当时是 0）或巨型 delta，也算一次连贯朗读。
            let matchedLen = min(gap, max(1, deltaCount))
            let matchedStart = newCursor - matchedLen
            for i in cursor..<matchedStart {
                statuses[i] = .skipped
            }
            for i in matchedStart..<newCursor {
                statuses[i] = .matched
            }
            cursor = newCursor
        } else if newCursor < cursor {
            // 回读：把撤销区间恢复为 unread
            for i in newCursor..<cursor {
                statuses[i] = .unread
            }
            cursor = newCursor
        }
        return snapshot()
    }

    /// 重置追踪器（场景：换了一段新稿件）。
    public func reset() {
        cursor = 0
        lastObservedTokenCount = 0
        statuses = Array(repeating: .unread, count: reference.count)
    }

    private func snapshot() -> TeleprompterPayload {
        TeleprompterPayload(
            tokens: reference,
            displayTokens: displayReference,
            statuses: statuses,
            cursor: cursor
        )
    }
}
