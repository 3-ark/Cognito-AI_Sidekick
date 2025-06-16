export const extractMainContent = (htmlString: string): string => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        doc.querySelectorAll(
            'script, style, nav, footer, header, svg, img, noscript, iframe, form, aside, .sidebar, .ad, .advertisement, .banner, .popup, .modal, .cookie-banner, link[rel="stylesheet"], button, input, select, textarea, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]'
        ).forEach(el => el.remove());

        let contentElement = doc.querySelector('main')
            || doc.querySelector('article')
            || doc.querySelector('.content')
            || doc.querySelector('#content')
            || doc.querySelector('.main-content')
            || doc.querySelector('#main-content')
            || doc.querySelector('.post-content')
            || doc.body;

        let text = contentElement?.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        text = text.split('\n').filter(line => line.trim().length > 20).join('\n');

        return text;
    } catch (error) {
        console.error("Error parsing HTML for content extraction:", error);
        return "[Error extracting content]";
    }
};

export async function scrapeUrlContent(url: string, abortSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const signal = abortSignal || controller.signal;
  const timeoutId = !abortSignal ? setTimeout(() => controller.abort(), 12000) : null;
  try {
    const response = await fetch(url, {
      signal: signal,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (signal.aborted) throw new Error("Scraping aborted by user.");
    if (!response.ok) throw new Error(`Failed to fetch ${url} - Status: ${response.status}`);
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) throw new Error(`Skipping non-HTML content (${contentType}) from ${url}`);
    const html = await response.text();
    return extractMainContent(html);
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
        return `[Scraping URL aborted: ${url}]`;
    }
    return `[Error scraping URL: ${url} - ${error.message}]`;
  }
}
