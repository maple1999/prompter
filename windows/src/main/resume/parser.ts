import * as fs from 'fs';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

export async function parseResumePDF(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdfDocument = await loadingTask.promise;
  
  let fullText = '';
  
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  
  return fullText.trim();
}
