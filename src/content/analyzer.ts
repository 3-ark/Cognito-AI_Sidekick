/*
Content Script (TypeScript)
Purpose: Scan DOM for links, buttons, inputs, textareas, selects, and forms.
Outputs: console log + compact JSON report suitable for passing to an LLM.
Features:
 - stable CSS and XPath locator generation
 - visibility + bounding box (viewport coordinates)
 - label/ARIA/placeholder extraction
 - suggested action set per element
 - optional same-origin iframe crawling
 - optional auto-refresh via MutationObserver with debounce

Usage:
 - Compile to JS and inject as a content script (or paste in console for testing)
 - Configure options in `CONFIG`
 - Call `start()` to begin scanning. Use `stop()` to stop observers.
*/

type ElementReport = {
  id?: string | null;
  tag: string;
  role?: string | null;
  css: string;
  xpath: string;
  visible: boolean;
  bbox?: { x: number; y: number; width: number; height: number } | null;
  label?: string | null;
  aria?: { [k: string]: string } | null;
  placeholder?: string | null;
  attributes: { [k: string]: string | null };
  actions: string[];
  score?: number; // small heuristic score for "interestingness"
};

type Report = {
  url: string;
  title?: string;
  timestamp: string;
  elements: ElementReport[];
  meta?: { scannedFrames: number };
};

const CONFIG = {
  crawlIframesSameOrigin: true,
  observeMutations: true,
  mutationDebounceMs: 400,
  maxElements: 2000, // safeguard
  includeInvisible: false, // whether to report invisible elements
};

// ------------------------- Utilities -------------------------
function nowISO() {
  return new Date().toISOString();
}

function isElementVisible(el: Element): boolean {
  try {
    const style = window.getComputedStyle(el as Element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = (el as HTMLElement).getBoundingClientRect ? (el as HTMLElement).getBoundingClientRect() : null;
    if (!rect) return false;
    if (rect.width <= 0 || rect.height <= 0) return false;
    // element inside document flow check
    if ((el as HTMLElement).offsetParent === null && style.position !== 'fixed') return false;
    return true;
  } catch (e) {
    return false;
  }
}

function getBBox(el: Element) {
  if (!(el instanceof Element)) return null;
  try {
    const r = (el as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  } catch (e) {
    return null;
  }
}

function safeAttr(el: Element, name: string) {
  try {
    return el.getAttribute && el.getAttribute(name);
  } catch (e) {
    return null;
  }
}

// Compose a relatively stable CSS selector: prefer id, then data-* unique attributes, then tag.class + nth-child fallback
function cssSelector(el: Element): string {
  if (el instanceof HTMLElement && el.id) {
    return `#${CSS.escape(el.id)}`;
  }
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < 8) {
    let part = cur.nodeName.toLowerCase();
    if (cur instanceof HTMLElement) {
      // try to get unique attribute
      const attrsToTry = ['data-testid', 'data-test', 'data-qa', 'aria-label', 'role', 'name', 'title'];
      for (const a of attrsToTry) {
        const v = safeAttr(cur, a);
        if (v) {
          part += `[${a}="${v.replace(/"/g, '\\"')}"]`;
          break;
        }
      }
      if (cur.classList && cur.classList.length) {
        // pick at most 2 classes
        const classes = Array.from(cur.classList).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
        if (classes) part += classes;
      }
    }
    // if there are identical siblings, use nth-child
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.nodeName === cur!.nodeName);
      if (siblings.length > 1) {
        const idx = Array.from(parent.children).indexOf(cur) + 1;
        part += `:nth-child(${idx})`;
      }
    }
    parts.unshift(part);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

// Generate an XPath for the element (useful fallback)
function xpath(el: Node): string {
  if (el.nodeType === Node.DOCUMENT_NODE) return '/';
  const parts: string[] = [];
  let cur: Node | null = el;
  while (cur && cur.nodeType !== Node.DOCUMENT_NODE) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const e = cur as Element;
      let name = e.nodeName.toLowerCase();
      const parent = cur.parentNode;
      if (parent) {
        const siblings = Array.from(parent.childNodes).filter(n => n.nodeType === Node.ELEMENT_NODE && (n as Element).nodeName === e.nodeName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(e) + 1;
          name += `[${idx}]`;
        }
      }
      parts.unshift(name);
    }
    cur = cur.parentNode;
  }
  return '/' + parts.join('/');
}

function getLabelText(el: Element): string | null {
  try {
    // 1. label element referencing via for
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const id = el.id;
      if (id) {
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lab) return (lab.textContent || '').trim();
      }
      // check closest label
      const closestLabel = el.closest('label');
      if (closestLabel) return (closestLabel.textContent || '').trim();
    }
    // aria-label / aria-labelledby
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledby) {
      const target = document.getElementById(labelledby);
      if (target) return (target.textContent || '').trim();
    }
    // alt / title / placeholder
    const alt = el.getAttribute && el.getAttribute('alt');
    if (alt) return alt.trim();
    const title = el.getAttribute && el.getAttribute('title');
    if (title) return title.trim();
    const ph = (el as HTMLInputElement).placeholder;
    if (ph) return ph.trim();
    // text content for buttons/anchors
    if (el.textContent) {
      const t = (el.textContent || '').trim();
      if (t.length && t.length < 120) return t;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function collectAria(el: Element) {
  const out: { [k: string]: string } = {};
  Array.from(el.attributes).forEach(a => {
    if (a.name.startsWith('aria-')) out[a.name] = a.value;
  });
  return Object.keys(out).length ? out : null;
}

// Actions heuristic
function actionsForElement(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  const actions = new Set<string>();
  if (tag === 'a') {
    const href = (el as HTMLAnchorElement).href;
    if (href) actions.add('navigate');
    actions.add('click');
  }
  if (tag === 'button' || (el instanceof HTMLElement && el.getAttribute('role') === 'button')) {
    actions.add('click');
  }
  if (tag === 'input') {
    const t = (el as HTMLInputElement).type || 'text';
    if (['button', 'submit', 'reset'].includes(t)) actions.add('click');
    else if (t === 'checkbox' || t === 'radio') actions.add('toggle');
    else actions.add('fill');
  }
  if (tag === 'textarea') actions.add('fill');
  if (tag === 'select') actions.add('select');
  if (tag === 'form') actions.add('submit');
  // clickable elements
  if (el instanceof HTMLElement) {
    const onclick = el.getAttribute('onclick') || (el as HTMLElement).dataset?.action;
    if (onclick) actions.add('click');
    const role = el.getAttribute('role');
    if (role === 'link') actions.add('navigate');
  }
  // default fallback
  if (!actions.size) actions.add('inspect');
  return Array.from(actions);
}

// small interest heuristic - prioritize interactive & visible elements
function scoreElement(el: Element) {
  let s = 0;
  const tag = el.tagName.toLowerCase();
  if (['a', 'button', 'input', 'select', 'textarea', 'form'].includes(tag)) s += 10;
  if ((el as HTMLElement).getAttribute && (el as HTMLElement).getAttribute('onclick')) s += 5;
  if (el.hasAttribute && el.hasAttribute('role')) s += 3;
  if (isElementVisible(el)) s += 5;
  return s;
}

// ------------------------- Scanning -------------------------
function gatherElements(root: Document | ShadowRoot = document): Element[] {
  const selectors = ['a[href]', 'button', 'input', 'textarea', 'select', 'form', '[role="button"]', '[role="link"]', '[data-action]'];
  const max = CONFIG.maxElements;
  const nodeList = root.querySelectorAll(selectors.join(','));
  const arr: Element[] = [];
  for (let i = 0; i < nodeList.length && arr.length < max; i++) arr.push(nodeList[i] as Element);
  return arr;
}

function elementToReport(el: Element): ElementReport {
  const tag = el.tagName.toLowerCase();
  const visible = isElementVisible(el);
  const bbox = getBBox(el);
  const attrs: { [k: string]: string | null } = {};
  if (el.attributes) {
    Array.from(el.attributes).forEach(a => (attrs[a.name] = a.value));
  }
  // gather minimal set
  const rep: ElementReport = {
    id: (el as HTMLElement).id || null,
    tag,
    role: el.getAttribute ? el.getAttribute('role') : null,
    css: cssSelector(el),
    xpath: xpath(el),
    visible: visible || false,
    bbox: bbox,
    label: getLabelText(el),
    aria: collectAria(el),
    placeholder: (el as HTMLInputElement).placeholder || null,
    attributes: attrs,
    actions: actionsForElement(el),
    score: scoreElement(el),
  };
  return rep;
}

function scanDocument(doc: Document | ShadowRoot): Report {
  const elements = gatherElements(doc);
  const reports: ElementReport[] = [];
  for (const el of elements) {
    const r = elementToReport(el);
    if (!CONFIG.includeInvisible && !r.visible) continue;
    reports.push(r);
  }
  // sort by score desc
  reports.sort((a, b) => (b.score || 0) - (a.score || 0));
  const report: Report = {
    url: (doc as Document).location?.href || window.location.href,
    title: (doc as Document).title || document.title,
    timestamp: nowISO(),
    elements: reports,
    meta: { scannedFrames: 0 },
  };
  return report;
}

async function scanFrames(rootDoc: Document): Promise<Report> {
  const mainReport = scanDocument(rootDoc);
  let framesScanned = 0;
  if (CONFIG.crawlIframesSameOrigin) {
    const iframes = Array.from(rootDoc.querySelectorAll('iframe')) as HTMLIFrameElement[];
    for (const iframe of iframes) {
      try {
        const idoc = iframe.contentDocument;
        if (!idoc) continue;
        // same-origin check: accessing contentDocument would throw if cross-origin
        const rep = scanDocument(idoc);
        // prefix element locators with frame index to keep them unique (simple approach)
        rep.elements.forEach(e => {
          e.css = `iframe[src="${iframe.src}"] > ${e.css}`;
        });
        mainReport.elements.push(...rep.elements);
        framesScanned++;
      } catch (e) {
        // cross-origin or blocked
        continue;
      }
    }
  }
  mainReport.meta = { scannedFrames: framesScanned };
  mainReport.timestamp = nowISO();
  mainReport.url = window.location.href;
  return mainReport;
}

// ------------------------- Output & Helpers -------------------------
function compactReport(report: Report) {
  // remove verbose attrs we don't need for LLM by default (example: full attributes may be trimmed)
  const compactEls = report.elements.map(e => ({
    tag: e.tag,
    id: e.id,
    css: e.css,
    xpath: e.xpath,
    visible: e.visible,
    bbox: e.bbox,
    label: e.label,
    aria: e.aria,
    placeholder: e.placeholder,
    actions: e.actions,
  }));
  return {
    url: report.url,
    title: report.title,
    timestamp: report.timestamp,
    count: compactEls.length,
    scannedFrames: report.meta?.scannedFrames || 0,
    elements: compactEls,
  };
}

function downloadJSON(obj: any, filename = 'dom-report.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(obj: any) {
  const txt = JSON.stringify(obj);
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch (e) {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (err) {
      ta.remove();
      return false;
    }
  }
}

// ------------------------- Public API -------------------------
let _observer: MutationObserver | null = null;
let _debounceTimer: number | null = null;
let _lastReport: Report | null = null;

async function scanAndReport(rootDoc: Document = document) {
  const report = await scanFrames(rootDoc);
  _lastReport = report;
  console.info('DOM Scanner — full report', report);
  const compact = compactReport(report);
  console.info('DOM Scanner — compact report (ready for LLM):', compact);
  // expose globally for quick access
  (window as any).__domScannerReport = compact;
  return compact;
}

function startObservation() {
  if (!CONFIG.observeMutations) return;
  if (_observer) return;
  _observer = new MutationObserver(mutations => {
    if (_debounceTimer) window.clearTimeout(_debounceTimer);
    _debounceTimer = window.setTimeout(() => {
      scanAndReport(document).catch(e => console.warn('scan failed', e));
    }, CONFIG.mutationDebounceMs);
  });
  _observer.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });
  console.info('DOM Scanner — mutation observer started');
}

function stopObservation() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
    console.info('DOM Scanner — mutation observer stopped');
  }
  if (_debounceTimer) {
    window.clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
}

async function start() {
  const compact = await scanAndReport(document);
  if (CONFIG.observeMutations) startObservation();
  return compact;
}

function stop() {
  stopObservation();
}

function getLastCompactReport() {
  return (window as any).__domScannerReport || null;
}

// convenience: export/download
async function exportReport(download = false) {
  const rep = getLastCompactReport();
  if (!rep) return null;
  if (download) downloadJSON(rep);
  const ok = await copyToClipboard(rep);
  console.info('DOM Scanner — export: copied to clipboard?', ok);
  return rep;
}

// attach to window for interactive use in console
Object.assign(window as any, {
  __domScannerStart: start,
  __domScannerStop: stop,
  __domScannerExport: exportReport,
  __domScannerGetLast: getLastCompactReport,
  __domScannerConfig: CONFIG,
});

// The script ends here. You may change CONFIG values at runtime via `window.__domScannerConfig`.

export const analyzePage = start;
