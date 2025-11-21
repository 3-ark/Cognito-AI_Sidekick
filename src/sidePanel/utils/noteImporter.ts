import Defuddle from 'defuddle';
import { unzip, Unzipped } from 'fflate';
import yaml from 'js-yaml';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import { Note } from '../../types/noteTypes';

// Configure PDF.js worker
// Ensure the worker is copied to the output directory by webpack (e.g., using CopyWebpackPlugin)
// and the path is correct for the extension environment.
try {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    const workerUrl = chrome.runtime.getURL('pdf.worker.mjs'); // Standard name for pdfjs-dist worker

    if (workerUrl) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } else {
      console.warn("[noteImporter] Could not get PDF.js worker URL via chrome.runtime.getURL. PDF processing might fail.");
    }
  } else if (typeof window !== 'undefined') {
    // Fallback for environments where chrome.runtime is not available but it might be a web page
    // This path might need adjustment based on how pdf.worker.mjs is served.
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    console.warn("[noteImporter] chrome.runtime.getURL not available, using CDN for PDF.js worker. This might not be ideal for extensions.");
  } else {
    console.warn("[noteImporter] PDF.js worker source not configured. PDF processing might fail.");
  }
} catch (e) {
  console.error("[noteImporter] Error setting pdf.js worker source:", e);
}

// Initialize Turndown service
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '*',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
});

turndownService.use(gfm);

// Helper function to read file as ArrayBuffer
const readFileAsArrayBuffer = (inputFile: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(inputFile);
  });
};

// Helper function to read file as text
const readFileAsText = (inputFile: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(inputFile);
  });
};

// Helper function to process a single file
async function processFile(file: File): Promise<Partial<Note> & { content: string }> {
  const fileType = file.name.split('.').pop()?.toLowerCase();
  const defaultTitleFromFile = file.name.replace(/\.[^/.]+$/, "");
  let rawContentFromFile = "";
  let potentialTitle = defaultTitleFromFile;
  let noteTagsToSave = ['imported'];
  let noteUrlToSave: string | undefined = undefined;

  if (fileType === 'pdf') {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const typedarray = new Uint8Array(arrayBuffer);
    const pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
    let pdfText = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();

      pdfText += textContent.items.map(item => {
        if ('str' in item) {
          return item.str;
        }

        return '';
      }).join(" ") + "\n";
    }

    rawContentFromFile = pdfText.trim();
  } else if (fileType === 'html' || fileType === 'htm') {
    const htmlContent = await readFileAsText(file);
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    let finalHtmlToConvert = doc.body.innerHTML;

    try {
      if (typeof Defuddle === 'function') {
        const defuddleInstance = new Defuddle(doc, { markdown: false, url: file.name });
        const defuddleResult = defuddleInstance.parse();

        if (defuddleResult.content) {
          finalHtmlToConvert = defuddleResult.content;
        }

        potentialTitle = defuddleResult.title || doc.title || potentialTitle;
      } else {
        potentialTitle = doc.title || potentialTitle;
      }
    } catch (defuddleError) {
      console.error(`[noteImporter] Error using Defuddle for ${file.name}:`, defuddleError);
      potentialTitle = doc.title || potentialTitle;
    }

    rawContentFromFile = turndownService.turndown(finalHtmlToConvert);
  } else if (fileType === 'csv' || fileType === 'tsv') {
    const textContent = await readFileAsText(file);
    const parsed = Papa.parse(textContent, { header: true });

    rawContentFromFile = JSON.stringify(parsed.data, null, 2); // Convert CSV/TSV to JSON string
    potentialTitle = `${defaultTitleFromFile} (JSON from ${fileType.toUpperCase()})`;
  } else if (fileType === 'json') {
    const textContent = await readFileAsText(file);

    // Attempt to parse to check validity, but store as string
    JSON.parse(textContent);
    rawContentFromFile = textContent;
  } else if (fileType === 'jsonl') {
    const textContent = await readFileAsText(file);

    // Validate each line is valid JSON
    textContent.split('\n').forEach(line => {
      if (line.trim() !== '') JSON.parse(line);
    });
    rawContentFromFile = textContent;
  } else if (fileType === 'zip') {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const unzipped: Unzipped = await new Promise((resolve, reject) => {
      unzip(new Uint8Array(arrayBuffer), (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // For simplicity, we'll extract text-based files and concatenate them.
    // A more sophisticated approach might create multiple notes or handle images/other data.
    let combinedContent = "";

    for (const filename in unzipped) {
      if (/\.(txt|md|html|htm|json|jsonl|csv|tsv)$/i.test(filename)) {
        const fileData = unzipped[filename];
        const textDecoder = new TextDecoder();

        combinedContent += `--- Source: ${filename} ---\n${textDecoder.decode(fileData)}\n\n`;
      }
    }

    rawContentFromFile = combinedContent.trim();
    potentialTitle = `${defaultTitleFromFile} (ZIP contents)`;
  } else if (fileType === 'epub') {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const unzipped: Unzipped = await new Promise((resolve, reject) => {
      unzip(new Uint8Array(arrayBuffer), (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Basic EPUB handling: find XHTML/HTML files and convert to Markdown
    // This is a simplified approach. Full EPUB parsing is complex.
    let epubContent = "";
    const contentFiles = Object.keys(unzipped).filter(name => /\.(xhtml|html)$/i.test(name));

    // Try to find OPF file to determine reading order (very basic)
    const opfFileEntry = Object.entries(unzipped).find(([name]) => name.toLowerCase().endsWith('.opf'));
    let orderedContentFiles: string[] = contentFiles;

    if (opfFileEntry) {
        const opfContent = new TextDecoder().decode(opfFileEntry[1]);
        const parser = new DOMParser();
        const opfDoc = parser.parseFromString(opfContent, "application/xml");

        // Extract <dc:title> from OPF metadata
        const dcTitle = opfDoc.querySelector('metadata > dc\\:title, metadata > title');

        if (dcTitle && dcTitle.textContent && dcTitle.textContent.trim()) {
            potentialTitle = dcTitle.textContent.trim();
        }

        const itemrefs = Array.from(opfDoc.getElementsByTagName("itemref"));
        const manifestItems = Array.from(opfDoc.getElementsByTagName("item"));

        const idToHref: Record<string, string> = {};

        manifestItems.forEach(item => {
            const id = item.getAttribute("id");
            const href = item.getAttribute("href");

            if (id && href) {
                const opfDir = opfFileEntry[0].substring(0, opfFileEntry[0].lastIndexOf('/') + 1);

                idToHref[id] = opfDir ? opfDir + href : href;
            }
        });

        const sortedHrefs = itemrefs.map(ref => idToHref[ref.getAttribute("idref") || '']).filter(Boolean);

        if (sortedHrefs.length > 0) {
            orderedContentFiles = sortedHrefs.filter(href => contentFiles.includes(href));

            // Add any content files not in OPF order at the end
            contentFiles.forEach(cf => {
                if (!orderedContentFiles.includes(cf)) orderedContentFiles.push(cf);
            });
        }
    }

    for (const filename of orderedContentFiles) {
      const fileData = unzipped[filename];

      if (fileData) {
        const htmlText = new TextDecoder().decode(fileData);
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // Only use first chapter <h1> as title if OPF title is missing
        if ((!potentialTitle || potentialTitle === defaultTitleFromFile) && doc.querySelector('h1')) {
            const h1 = doc.querySelector('h1');

            if (h1 && h1.textContent) potentialTitle = h1.textContent.trim();
        }

        epubContent += turndownService.turndown(doc.body.innerHTML) + "\n\n";
      }
    }

    rawContentFromFile = epubContent.trim();
    potentialTitle = `${potentialTitle} (EPUB)`;
    } else { // Default for TXT, MD, and others
    rawContentFromFile = await readFileAsText(file);
  }

  // Frontmatter parsing for MD, TXT, HTML (after conversion for HTML)
  if (fileType === 'md' || fileType === 'txt' || fileType === 'html' || fileType === 'htm' || fileType === 'pdf' /* Allow frontmatter in PDF text output */) {
    const frontmatterRegex = /^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/;
    const match = frontmatterRegex.exec(rawContentFromFile);

    if (match) {
      const yamlString = match[1];
      const mainContent = match[2];

      try {
        const frontmatter = yaml.load(yamlString) as any;

        if (frontmatter && typeof frontmatter === 'object') {
          if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
            potentialTitle = frontmatter.title.trim();
          }

          if (Array.isArray(frontmatter.tags) && frontmatter.tags.every((tag: unknown): tag is string => typeof tag === 'string')) {
            noteTagsToSave = frontmatter.tags.map((tag: string) => tag.trim()).filter((tag: string) => tag);
          } else if (typeof frontmatter.tags === 'string') {
            noteTagsToSave = [frontmatter.tags.trim()].filter(tag => tag);
          }

          if (noteTagsToSave.length === 0) noteTagsToSave = ['imported'];

          if (typeof frontmatter.source === 'string' && frontmatter.source.trim()) {
            noteUrlToSave = frontmatter.source.trim();
          } else if (typeof frontmatter.url === 'string' && frontmatter.url.trim()) {
            noteUrlToSave = frontmatter.url.trim();
          }

          rawContentFromFile = mainContent.trim();
        }
      } catch (yamlError) {
        console.warn(`[noteImporter] Failed to parse YAML frontmatter for ${file.name}:`, yamlError);
      }
    }
  }

  if (!rawContentFromFile.trim()) {
    throw new Error('Content is empty.');
  }

  return {
    title: potentialTitle,
    content: rawContentFromFile,
    tags: noteTagsToSave,
    url: noteUrlToSave,
  };
}

export interface ImportResult {
  success: boolean;
  note?: Partial<Note> & { content: string };
  error?: string;
  fileName: string;
}

export async function importFiles(files: File[]): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  for (const file of files) {
    try {
      const processedNote = await processFile(file);

      results.push({
 success: true, note: processedNote, fileName: file.name, 
});
    } catch (error: any) {
      console.error(`[noteImporter] Error importing note ${file.name}:`, error);
      results.push({
 success: false, error: error.message || 'Failed to import', fileName: file.name, 
});
    }
  }

  return results;
}
