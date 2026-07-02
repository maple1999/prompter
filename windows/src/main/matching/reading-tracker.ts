import { TokenNormalizer } from './token-normalizer';
import { FuzzyMatcher } from './fuzzy-matcher';
import { TeleprompterPayload, TokenStatus, NormalizedToken } from '../../shared/types';

export class ReadingTracker {
  private referenceTokens: NormalizedToken[] = [];
  private statuses: TokenStatus[] = [];
  private cursor: number = 0;
  private lastObservedTokenCount: number = 0;

  constructor(referenceText: string) {
    this.referenceTokens = TokenNormalizer.normalize(referenceText);
    this.statuses = Array(this.referenceTokens.length).fill('unread');
    this.cursor = 0;
  }

  ingest(asrText: string) {
    const observedTokens = TokenNormalizer.normalize(asrText).map(t => t.normalized);
    
    // Determine the delta (new words spoken)
    const newTokens = observedTokens.slice(this.lastObservedTokenCount);
    if (newTokens.length === 0) return;

    this.lastObservedTokenCount = observedTokens.length;

    // We only take the tail of new tokens for matching to handle continuous speech
    // Max 10 tokens lookback
    const tailToMatch = newTokens.slice(-10);
    const refNormalized = this.referenceTokens.map(t => t.normalized);

    const alignment = FuzzyMatcher.bestAlignment(
      tailToMatch,
      refNormalized,
      this.cursor,
      30 // Search window size
    );

    if (alignment && alignment.distance < tailToMatch.length * 0.4) {
      // Good match found
      const newCursor = alignment.index;
      
      // If we moved forward, mark intermediate tokens
      if (newCursor > this.cursor) {
        // Assume recent tokens matched, older ones skipped
        for (let i = this.cursor; i < newCursor; i++) {
          if (this.statuses[i] !== 'matched') {
            this.statuses[i] = (i >= newCursor - tailToMatch.length) ? 'matched' : 'skipped';
          }
        }
      } else if (newCursor < this.cursor) {
        // User jumped back (re-reading)
        for (let i = newCursor; i < this.cursor; i++) {
          this.statuses[i] = 'unread';
        }
      }

      this.cursor = Math.min(newCursor, this.referenceTokens.length - 1);
    }
  }

  snapshot(): TeleprompterPayload {
    return {
      tokens: this.referenceTokens.map(t => t.normalized),
      displayTokens: this.referenceTokens.map(t => t.display),
      statuses: [...this.statuses],
      cursor: this.cursor
    };
  }

  reset() {
    this.statuses = Array(this.referenceTokens.length).fill('unread');
    this.cursor = 0;
    this.lastObservedTokenCount = 0;
  }
}
