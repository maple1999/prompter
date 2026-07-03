import { TokenNormalizer } from './token-normalizer';
import { FuzzyMatcher } from './fuzzy-matcher';
import { TeleprompterPayload, TokenStatus } from '../../shared/types';

/**
 * 跳读鲁棒的朗读追踪器（忠实移植 macOS ReadingTracker.swift）。
 *
 * 使用方式：
 *   1. 用提词稿文本初始化；
 *   2. 每次 ASR 累积 transcript 变化时调用 `ingest()`；
 *   3. `snapshot()` 给 UI 渲染。
 *
 * 策略：
 *   - 用 lastObservedTokenCount 跟踪 ASR 累积文本的 token 数，每次得到增量 deltaCount；
 *   - 把最近 max(tailLength, deltaCount+2) 个 token 作为「指纹」（带旧 token 上下文，
 *     delta 为 0 时也重新匹配 —— ASR 修订可能不改变 token 数），
 *     在 [cursor - searchBack, cursor + searchAhead) 区间用 FuzzyMatcher 找最佳对齐；
 *   - 置信度 ≥ confidenceThreshold 才移动 cursor；
 *   - 推进时 matched 区间 = 最近 deltaCount 个 token，更早的标 skipped；
 *   - 允许回退（用户回读），撤销区间恢复 unread。
 */
export class ReadingTracker {
  private reference: string[] = [];
  private displayReference: string[] = [];

  private statuses: TokenStatus[] = [];
  private cursor = 0;
  private lastObservedTokenCount = 0;

  readonly confidenceThreshold: number;
  readonly tailLength: number;
  readonly searchAhead: number;
  readonly searchBack: number;

  constructor(
    referenceText: string,
    opts: {
      confidenceThreshold?: number;
      tailLength?: number;
      searchAhead?: number;
      searchBack?: number;
    } = {}
  ) {
    const tokens = TokenNormalizer.normalize(referenceText);
    this.reference = tokens.map((t) => t.normalized);
    this.displayReference = tokens.map((t) => t.display);
    this.statuses = new Array<TokenStatus>(tokens.length).fill('unread');
    this.confidenceThreshold = opts.confidenceThreshold ?? 0.55;
    this.tailLength = opts.tailLength ?? 6;
    this.searchAhead = opts.searchAhead ?? 40;
    this.searchBack = opts.searchBack ?? 30;
  }

  get currentCursor(): number {
    return this.cursor;
  }

  /** 接收一次 ASR 累积 transcript（完整 partial text），更新状态。 */
  ingest(asrText: string): TeleprompterPayload {
    if (this.reference.length === 0) return this.snapshot();

    const observedTokens = TokenNormalizer.normalize(asrText).map((t) => t.normalized);
    if (observedTokens.length === 0) return this.snapshot();

    // 与上次相比新增了多少 token（ASR 修订可能收缩，此时视作 0，但仍重新匹配尾段）。
    const deltaCount = Math.max(0, observedTokens.length - this.lastObservedTokenCount);
    this.lastObservedTokenCount = observedTokens.length;

    // 尾段至少 tailLength 个，一次性新增很多则扩大，让整段增量 + 少量旧上下文参与匹配。
    const effectiveTail = Math.min(
      observedTokens.length,
      Math.max(this.tailLength, deltaCount + 2)
    );
    const tail = observedTokens.slice(-effectiveTail);

    const searchStart = Math.max(0, this.cursor - this.searchBack);
    const searchEnd = Math.min(this.reference.length, this.cursor + this.searchAhead);
    const align = FuzzyMatcher.bestAlignment(this.reference, tail, searchStart, searchEnd);
    if (!align || align.score < this.confidenceThreshold) {
      return this.snapshot();
    }

    const newCursor = align.endIndex + 1;

    if (newCursor > this.cursor) {
      // 向前推进。用 delta 判断「刚刚到底念了多少」：
      //   deltaCount >= gap → 一次 update 内念完整个 gap，全部 matched；
      //   deltaCount <  gap → 只有最近 deltaCount 个 matched，前面 skipped。
      const gap = newCursor - this.cursor;
      const matchedLen = Math.min(gap, Math.max(1, deltaCount));
      const matchedStart = newCursor - matchedLen;
      for (let i = this.cursor; i < matchedStart; i++) {
        this.statuses[i] = 'skipped';
      }
      for (let i = matchedStart; i < newCursor; i++) {
        this.statuses[i] = 'matched';
      }
      this.cursor = newCursor;
    } else if (newCursor < this.cursor) {
      // 回读：撤销区间恢复 unread
      for (let i = newCursor; i < this.cursor; i++) {
        this.statuses[i] = 'unread';
      }
      this.cursor = newCursor;
    }
    return this.snapshot();
  }

  /** 重置追踪器（场景：换了一段新稿件）。 */
  reset(): void {
    this.cursor = 0;
    this.lastObservedTokenCount = 0;
    this.statuses = new Array<TokenStatus>(this.reference.length).fill('unread');
  }

  snapshot(): TeleprompterPayload {
    return {
      tokens: [...this.reference],
      displayTokens: [...this.displayReference],
      statuses: [...this.statuses],
      cursor: this.cursor,
    };
  }
}
