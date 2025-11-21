import * as pdfjs from 'pdfjs-dist';

// Setting the worker source is required for pdfjs-dist to work.
// The worker is used to parse the PDF file in a separate thread.
// We are using the local worker file that is copied to the dist folder.
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');
} else {
  // Fallback for non-extension environments (e.g., testing)
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.mjs`;
}

export async function extractTextFromPdf(pdfBuffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: pdfBuffer }).promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    text += pageText + '\\n\\n';
  }

  return text;
}
