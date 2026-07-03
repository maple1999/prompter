import * as fs from 'fs';

/**
 * 用 pdfjs-dist 提取 PDF 纯文本。
 *
 * 注意版本：必须用 3.x —— 4.x 起 pdfjs-dist 是 ESM-only（legacy 构建也改名 .mjs），
 * CommonJS 的 require 直接找不到模块。3.x 的 legacy 构建在 Node 里开箱即用（fake worker）。
 */
export async function parseResumePDF(filePath: string): Promise<string> {
  // 惰性加载：pdfjs 引入时会尝试加载可选的 canvas 原生模块并打警告，
  // 文本提取用不到它，不要在应用启动时就触发。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);

  const loadingTask = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdfDocument = await loadingTask.promise;

  let fullText = '';
  try {
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: { str?: string }) => item.str ?? '')
        .join(' ');
      fullText += pageText + '\n\n';
    }
  } finally {
    await pdfDocument.destroy();
  }

  return fullText.trim();
}
