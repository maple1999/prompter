import Foundation

/// 在参考序列里找一个最佳对齐终点，使得"参考序列的尾段"与"观测尾段"最相似。
public enum FuzzyMatcher {
    public struct Alignment: Equatable, Sendable {
        public let endIndex: Int      // 参考序列中对齐终点的下标（闭区间）
        public let matchedLength: Int // 实际参与比对的参考切片长度
        public let score: Double      // 0.0 ~ 1.0，越高越匹配

        public init(endIndex: Int, matchedLength: Int, score: Double) {
            self.endIndex = endIndex
            self.matchedLength = matchedLength
            self.score = score
        }
    }

    /// Levenshtein 编辑距离（token 数组版）。
    public static func editDistance(_ a: [String], _ b: [String]) -> Int {
        let m = a.count, n = b.count
        if m == 0 { return n }
        if n == 0 { return m }
        var prev = Array(0...n)
        var curr = Array(repeating: 0, count: n + 1)
        for i in 1...m {
            curr[0] = i
            for j in 1...n {
                if a[i - 1] == b[j - 1] {
                    curr[j] = prev[j - 1]
                } else {
                    curr[j] = 1 + min(prev[j], curr[j - 1], prev[j - 1])
                }
            }
            swap(&prev, &curr)
        }
        return prev[n]
    }

    /// 在 reference[searchStart ..< searchEnd] 中寻找与 observedTail 最匹配的终点位置。
    ///
    /// - 对每个候选 end，取 reference[end-L+1 ... end]（L = observedTail.count）与 observedTail 做编辑距离；
    /// - score = 1 - editDist / max(L, sliceLen)；
    /// - 返回 score 最高的 Alignment。若 reference 为空或搜索窗口为空，返回 nil。
    public static func bestAlignment(
        reference: [String],
        observedTail: [String],
        searchStart: Int,
        searchEnd: Int
    ) -> Alignment? {
        guard !observedTail.isEmpty, !reference.isEmpty else { return nil }
        let lo = max(0, searchStart)
        let hi = min(reference.count, searchEnd)
        guard lo < hi else { return nil }
        let L = observedTail.count

        var best: Alignment?
        var bestScore = -1.0
        for end in lo..<hi {
            let start = max(0, end - L + 1)
            let slice = Array(reference[start...end])
            let dist = editDistance(slice, observedTail)
            let maxLen = max(slice.count, L)
            let score = maxLen == 0 ? 0.0 : 1.0 - Double(dist) / Double(maxLen)
            if score > bestScore {
                bestScore = score
                best = Alignment(endIndex: end, matchedLength: slice.count, score: score)
            }
        }
        return best
    }
}
