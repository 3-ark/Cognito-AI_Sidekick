// Bridge function to be executed in the context of the web page
export function bridge() {
    let title = '';
    let textContent = '';
    let htmlContent = '';
    let altTexts = '';
    let tableData = '';
    let metaDescription = '';
    let metaKeywords = '';

    try {
        title = document.title || '';

        const MAX_BODY_CHARS_FOR_DIRECT_EXTRACTION = 5_000_000; // Approx 5MB of text

        if (document.body && document.body.innerHTML.length > MAX_BODY_CHARS_FOR_DIRECT_EXTRACTION) {
            console.warn(`[Cognito Bridge] Document body is very large (${document.body.innerHTML.length} chars). Attempting to use a cloned, simplified version for text extraction to improve performance/stability.`);

            const clonedBody = document.body.cloneNode(true) as HTMLElement;

            clonedBody.querySelectorAll('script, style, noscript, iframe, embed, object').forEach(el => el.remove());
            textContent = (clonedBody.textContent || '').replace(/\s\s+/g, ' ').trim();

            // htmlContent is intentionally set to the original body's innerHTML for now,
            // as simplifying it might lose crucial structure if the full HTML is needed.
            // Consider if a simplified HTML is acceptable or if this strategy is preferred.
            htmlContent = document.body.innerHTML.replace(/\s\s+/g, ' ');

        } else if (document.body) {
            textContent = (document.body.innerText || '').replace(/\s\s+/g, ' ').trim();
            htmlContent = (document.body.innerHTML || '').replace(/\s\s+/g, ' ');
        } else {
            console.warn('[Cognito Bridge] document.body is not available.');
        }

        altTexts = Array.from(document.images)
            .map(img => img.alt)
            .filter(alt => alt && alt.trim().length > 0)
            .join('. ');

        tableData = Array.from(document.querySelectorAll('table'))
            .map(table => (table.innerText || '').replace(/\s\s+/g, ' '))
            .join('\n');

        const descElement = document.querySelector('meta[name="description"]');

        metaDescription = descElement ? descElement.getAttribute('content') || '' : '';

        const keywordsElement = document.querySelector('meta[name="keywords"]');

        metaKeywords = keywordsElement ? keywordsElement.getAttribute('content') || '' : '';

    } catch (error) {
        console.error('[Cognito Bridge] Error during content extraction:', error);
        let errorMessage = 'Unknown extraction error';

        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }

        return JSON.stringify({
            error: `Extraction failed: ${errorMessage}`,
            title: document.title || 'Error extracting title',
            text: '',
            html: '',
            altTexts: '',
            tableData: '',
            meta: { description: '', keywords: '' },
        });
    }

    const MAX_OUTPUT_STRING_LENGTH = 10_000_000;

    const responseCandidate = {
        title,
        text: textContent,
        html: htmlContent,
        altTexts,
        tableData,
        meta: {
            description: metaDescription,
            keywords: metaKeywords,
        },
    };

    // Truncate if the stringified response is too large
    if (JSON.stringify(responseCandidate).length > MAX_OUTPUT_STRING_LENGTH) {
        console.warn('[Cognito Bridge] Total extracted content is very large. Attempting to truncate.');
        const baseLength = JSON.stringify({ ...responseCandidate, text: "", html: "" }).length;
        let availableLength = MAX_OUTPUT_STRING_LENGTH - baseLength;

        const textRatio = 0.6; // Allocate 60% of remaining to text
        const htmlRatio = 0.8; // Allocate 80% of what's left after text to html (of the remaining from text)

        const textTruncateLength = Math.floor(availableLength * textRatio);

        if (responseCandidate.text.length > textTruncateLength) {
            responseCandidate.text = responseCandidate.text.substring(0, textTruncateLength) + "... (truncated)";
        }

        availableLength -= responseCandidate.text.length - (responseCandidate.text.endsWith("... (truncated)") ? "... (truncated)".length : 0) ; // Adjust available length

        const htmlTruncateLength = Math.floor(availableLength * htmlRatio);

         if (responseCandidate.html.length > htmlTruncateLength) {
             responseCandidate.html = responseCandidate.html.substring(0, htmlTruncateLength) + "... (truncated)";
        }

        console.warn('[Cognito Bridge] Content truncated. Final approx length:', JSON.stringify(responseCandidate).length);
    }

    return JSON.stringify(responseCandidate);
}
