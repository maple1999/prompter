import { NormalizedToken } from '../../shared/types';

export class TokenNormalizer {
  /**
   * Tokenizes and normalizes text for matching.
   * CJK characters become individual tokens.
   * English words are lowercased and grouped.
   * Punctuation is ignored for matching but preserved for display.
   */
  static normalize(text: string): NormalizedToken[] {
    const tokens: NormalizedToken[] = [];
    let currentEnglishWord = '';
    let currentDisplayBuffer = '';

    const pushEnglish = () => {
      if (currentEnglishWord.length > 0) {
        tokens.push({
          normalized: currentEnglishWord.toLowerCase(),
          display: currentDisplayBuffer,
        });
        currentEnglishWord = '';
        currentDisplayBuffer = '';
      } else if (currentDisplayBuffer.length > 0 && tokens.length > 0) {
        // Append punctuation/whitespace to the previous token's display
        tokens[tokens.length - 1].display += currentDisplayBuffer;
        currentDisplayBuffer = '';
      } else if (currentDisplayBuffer.length > 0) {
        // Edge case: punctuation at the very beginning
        tokens.push({ normalized: '', display: currentDisplayBuffer });
        currentDisplayBuffer = '';
      }
    };

    for (const char of text) {
      if (this.isCJK(char)) {
        pushEnglish();
        tokens.push({
          normalized: char,
          display: char,
        });
      } else if (this.isWhitespaceOrPunctuation(char)) {
        if (currentEnglishWord.length > 0) {
          pushEnglish();
        }
        if (tokens.length > 0) {
          tokens[tokens.length - 1].display += char;
        } else {
          currentDisplayBuffer += char;
        }
      } else {
        currentEnglishWord += char;
        currentDisplayBuffer += char;
      }
    }

    pushEnglish();

    // Filter out completely empty tokens if they somehow sneak in
    return tokens.filter(t => t.normalized.length > 0 || t.display.length > 0);
  }

  static reconstruct(tokens: NormalizedToken[]): string {
    return tokens.map(t => t.display).join('');
  }

  private static isCJK(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
           (code >= 0x3400 && code <= 0x4DBF) || // CJK Extension A
           (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
           (code >= 0x3040 && code <= 0x309F) || // Hiragana
           (code >= 0x30A0 && code <= 0x30FF) || // Katakana
           (code >= 0xAC00 && code <= 0xD7AF);   // Hangul Syllables
  }

  private static isWhitespaceOrPunctuation(char: string): boolean {
    return /^[\s\p{P}]$/u.test(char);
  }
}
