export class FuzzyMatcher {
  /**
   * Computes the Levenshtein edit distance between two token arrays.
   */
  static editDistance(a: string[], b: string[]): number {
    const m = a.length;
    const n = b.length;
    
    if (m === 0) return n;
    if (n === 0) return m;

    let d: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,       // deletion
          d[i][j - 1] + 1,       // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return d[m][n];
  }

  /**
   * Finds the best alignment of `observed` tokens within `reference` tokens,
   * searching around the `around` index within a `window` size.
   */
  static bestAlignment(
    observed: string[],
    reference: string[],
    around: number,
    window: number
  ): { index: number; distance: number } | null {
    if (observed.length === 0 || reference.length === 0) return null;

    const startIdx = Math.max(0, around - window);
    const endIdx = Math.min(reference.length, around + window);
    
    let bestIndex = around;
    let bestDist = Infinity;

    // Use a sliding window of the same length as observed
    for (let i = startIdx; i <= endIdx - observed.length; i++) {
      const refWindow = reference.slice(i, i + observed.length);
      const dist = this.editDistance(observed, refWindow);

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i + observed.length; // The point after the match
      }
    }

    return { index: bestIndex, distance: bestDist };
  }
}
