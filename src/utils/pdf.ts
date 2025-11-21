import * as pdfjsLib from 'pdfjs-dist';

export async function extractTextFromPdf(pdfUrl: string): Promise<string> {
  try {
    const response = await fetch(pdfUrl);

    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);

    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');

      fullText += `${pageText}\n\n`;
    }

    return fullText.trim();
  } catch (error) {
    throw error;
  }
}
