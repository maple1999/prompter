/**
 * 在参考序列里找一个最佳对齐终点，使得「参考序列的尾段」与「观测尾段」最相似。
 * 忠实移植 macOS FuzzyMatcher.swift：终点锚定 + 置信度评分。
 */
export interface Alignment {
  /** 参考序列中对齐终点的下标（闭区间） */
  endIndex: number;
  /** 实际参与比对的参考切片长度 */
  matchedLength: number;
  /** 0.0 ~ 1.0，越高越匹配 */
  score: number;
}

export class FuzzyMatcher {
  /** Levenshtein 编辑距离（token 数组版，双行滚动数组）。 */
  static editDistance(a: string[], b: string[]): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    let curr = new Array<number>(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1];
        } else {
          curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  /**
   * 在 reference[searchStart, searchEnd) 中寻找与 observedTail 最匹配的终点位置。
   *
   * 对每个候选 end，取 reference[max(0, end-L+1) ... end]（L = observedTail.length）
   * 与 observedTail 做编辑距离；score = 1 - dist / max(L, sliceLen)。
   * 返回 score 最高的 Alignment；reference 为空或搜索窗口为空时返回 null。
   */
  static bestAlignment(
    reference: string[],
    observedTail: string[],
    searchStart: number,
    searchEnd: number
  ): Alignment | null {
    if (observedTail.length === 0 || reference.length === 0) return null;
    const lo = Math.max(0, searchStart);
    const hi = Math.min(reference.length, searchEnd);
    if (lo >= hi) return null;

    const L = observedTail.length;
    let best: Alignment | null = null;
    let bestScore = -1;

    for (let end = lo; end < hi; end++) {
      const start = Math.max(0, end - L + 1);
      const slice = reference.slice(start, end + 1);
      const dist = FuzzyMatcher.editDistance(slice, observedTail);
      const maxLen = Math.max(slice.length, L);
      const score = maxLen === 0 ? 0 : 1 - dist / maxLen;
      if (score > bestScore) {
        bestScore = score;
        best = { endIndex: end, matchedLength: slice.length, score };
      }
    }
    return best;
  }
}
