import { NormalizedToken } from '../../shared/types';

/**
 * 中英混合分词 + 归一化（忠实移植 macOS TokenNormalizer.swift）。
 *
 * - normalized: 用于匹配（小写、去标点、中文逐字）
 * - display:    用于渲染的原始片段，全部 display 拼接后近似还原原文
 *
 * 分隔符（空白/标点/emoji）作为「前缀」附加到下一个 token 的 display，
 * 尾部残留分隔符贴到最后一个 token 的 display 后面 —— 与 Swift 版一致。
 */
export class TokenNormalizer {
  static normalize(text: string): NormalizedToken[] {
    const tokens: NormalizedToken[] = [];
    let pendingSeparator = '';   // 等待附加到下一个 token 前缀的空白/标点
    let englishNormalized = '';  // 英文/数字累积缓冲（小写）
    let englishDisplay = '';     // 对应的原文片段

    const flushEnglish = () => {
      if (englishNormalized.length === 0) return;
      tokens.push({
        normalized: englishNormalized,
        display: pendingSeparator + englishDisplay,
      });
      englishNormalized = '';
      englishDisplay = '';
      pendingSeparator = '';
    };

    for (const ch of text) {
      if (TokenNormalizer.isCJK(ch)) {
        flushEnglish();
        tokens.push({
          normalized: ch,
          display: pendingSeparator + ch,
        });
        pendingSeparator = '';
      } else if (TokenNormalizer.isWordChar(ch)) {
        englishNormalized += ch.toLowerCase();
        englishDisplay += ch;
      } else {
        // 分隔符：空白/标点/emoji 等
        if (englishNormalized.length > 0) {
          flushEnglish();
        }
        pendingSeparator += ch;
      }
    }
    flushEnglish();

    // 尾部残留的分隔符：贴到最后一个 token 的 display 后面
    if (pendingSeparator.length > 0 && tokens.length > 0) {
      tokens[tokens.length - 1] = {
        normalized: tokens[tokens.length - 1].normalized,
        display: tokens[tokens.length - 1].display + pendingSeparator,
      };
    }
    return tokens;
  }

  static reconstruct(tokens: NormalizedToken[]): string {
    return tokens.map((t) => t.display).join('');
  }

  /** 判断是否为 CJK 表意文字（中文 / 日文汉字 + 假名）。用 codePointAt 正确处理扩展 B 区的代理对。 */
  private static isCJK(char: string): boolean {
    const code = char.codePointAt(0);
    if (code === undefined) return false;
    return (
      (code >= 0x4e00 && code <= 0x9fff) ||   // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) ||   // CJK Extension A
      (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
      (code >= 0xf900 && code <= 0xfaff) ||   // CJK Compatibility Ideographs
      (code >= 0x3040 && code <= 0x309f) ||   // Hiragana
      (code >= 0x30a0 && code <= 0x30ff)      // Katakana
    );
  }

  /** 字母或数字（Unicode 感知，对应 Swift 的 ch.isLetter || ch.isNumber）。 */
  private static isWordChar(char: string): boolean {
    return /^[\p{L}\p{N}]$/u.test(char);
  }
}
