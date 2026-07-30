/** Shared helpers for PTW + Demand Setu PDF templates */

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inr(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);
}

export function fmtDate(val) {
  if (!val) return 'Flexible';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return esc(val);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function p2h(text) {
  if (!text) return '';
  return esc(text).replace(/\n/g, '<br>');
}

/**
 * Render itinerary description line-by-line, splitting on full stop (sentence per line).
 * Newlines are treated as separators too. Empty/whitespace lines are skipped.
 */
export function itinDesc(text) {
  if (!text) return '';

  // Split on newlines first, then split each chunk on ". " boundaries
  const raw = text
    .split(/\n+/)
    .flatMap((chunk) =>
      chunk
        .split(/(?<=\.)\s+/)  // split after each "." followed by whitespace
        .map((s) => s.trim())
        .filter(Boolean)
    );

  if (!raw.length) return '';

  return `<ul class="itin-lines">${raw
    .map((line) => `<li>${esc(line)}</li>`)
    .join('')}</ul>`;
}

export function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

export function safeHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/\s*style="[^"]*background-color:\s*transparent[^"]*"/gi, '')
    .replace(/<span[^>]*>\s*<\/span>/gi, '');
}

export function stripTags(str) {
  return decodeHtmlEntities(String(str || ''))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split Quill HTML into clean day/overview lines (handles &nbsp; + concatenated Day N). */
export function extractQuillLines(html) {
  if (!html) return [];
  const cleaned = safeHtml(html);
  const items = [];

  const headingRe = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match;
  while ((match = headingRe.exec(cleaned)) !== null) {
    const text = stripTags(match[1]);
    if (text) items.push(text);
  }
  if (items.length) return items;

  const blockRe = /<(?:p|li|div)[^>]*>([\s\S]*?)<\/(?:p|li|div)>/gi;
  while ((match = blockRe.exec(cleaned)) !== null) {
    const text = stripTags(match[1]);
    if (text) items.push(text);
  }
  if (items.length > 1) return items;

  const plain = stripTags(cleaned);
  if (!plain) return [];

  const daySplit = plain
    .split(/(?=Day\s*\d+\b)/gi)
    .map((s) => s.trim())
    .filter(Boolean);

  if (daySplit.length > 1) return daySplit;
  return items.length ? items : [plain];
}

export function formatOverviewBlocks(html, { numbered = false } = {}) {
  const lines = extractQuillLines(html);
  if (!lines.length) return '';

  if (numbered) {
    return lines
      .map(
        (text, i) => `
      <div class="ov-item">
        <span class="ov-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="ov-text">${esc(text)}</span>
      </div>`
      )
      .join('');
  }

  return `<div class="pkg-desc-items">${lines
    .map(
      (text) => `
    <div class="pkg-desc-item">
      <div class="pkg-desc-item-text">${esc(text)}</div>
    </div>`
    )
    .join('')}</div>`;
}

export function formatListBlocks(html, { numbered = false } = {}) {
  return formatQuillContent(html, { numbered });
}

/**
 * Sanitize React Quill HTML for safe PDF embedding.
 * Keeps lists / paragraphs / basic inline formatting from Quill.
 */
export function sanitizeQuillHtml(html) {
  if (!html) return '';
  let h = String(html);

  h = h.replace(/<script[\s\S]*?<\/script>/gi, '');
  h = h.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  h = h.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Drop event handlers / dangerous attrs
  h = h.replace(/\s+on\w+\s*=\s*(['"]).*?\1/gi, '');
  h = h.replace(/\s+(?:style|class|id|contenteditable|data-[\w-]+)\s*=\s*(['"]).*?\1/gi, '');

  // Remove disallowed tags but keep their text content
  h = h.replace(
    /<\/?(?!\/?(?:p|br|ol|ul|li|strong|b|em|i|u|s|span|h[1-6]|sub|sup)\b)[a-zA-Z][^>]*>/gi,
    ''
  );

  h = safeHtml(h);
  // Empty Quill paragraphs
  h = h.replace(/<p>(?:\s|&nbsp;|<br\s*\/?\s*>)*<\/p>/gi, '');
  h = h.replace(/(?:&nbsp;|\u00a0)/gi, ' ');
  return h.trim();
}

/**
 * Render React Quill HTML (inclusions / exclusions / customExclusions) for PDF.
 * Prefers structured list cards; falls back to sanitized Quill HTML block.
 */
export function formatQuillContent(html, { numbered = false } = {}) {
  const cleaned = sanitizeQuillHtml(html);
  if (!cleaned) {
    return numbered
      ? '<div class="ov-item"><span class="ov-text">—</span></div>'
      : '<div class="pkg-desc-item"><div class="pkg-desc-item-text">—</div></div>';
  }

  const items = [];

  // Quill ordered/unordered lists
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(cleaned)) !== null) {
    const text = stripTags(match[1]);
    if (text) items.push(text);
  }

  // Quill often uses <p>…</p> lines instead of <li>
  if (!items.length) {
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = pRegex.exec(cleaned)) !== null) {
      const text = stripTags(match[1]);
      if (text) items.push(text);
    }
  }

  // Headings as separate items
  if (!items.length) {
    const hRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    while ((match = hRegex.exec(cleaned)) !== null) {
      const text = stripTags(match[1]);
      if (text) items.push(text);
    }
  }

  if (!items.length) {
    const parts = cleaned
      .split(/<br\s*\/?>/i)
      .map((p) => stripTags(p))
      .filter(Boolean);
    if (parts.length) items.push(...parts);
  }

  if (!items.length) {
    const fallback = stripTags(cleaned);
    if (fallback) items.push(fallback);
  }

  if (!items.length) {
    // Last resort: embed sanitized Quill HTML as-is
    return `<div class="quill-pdf">${cleaned}</div>`;
  }

  if (numbered) {
    return items
      .map(
        (text, i) => `
      <div class="ov-item">
        <span class="ov-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="ov-text">${esc(text)}</span>
      </div>`
      )
      .join('');
  }

  return `<div class="pkg-desc-items">${items
    .map(
      (text) => `
    <div class="pkg-desc-item">
      <div class="pkg-desc-item-text">${esc(text)}</div>
    </div>`
    )
    .join('')}</div>`;
}

/** Apply discountPercentage to package finalTotal (TOTAL PRICE / Grand Total). */
export function resolveDisplayTotal(operation) {
  const finalTotal = Number(operation?.finalTotal) || 0;
  const discountPercentage = Number(operation?.discountPercentage) || 0;
  const hasDiscount = discountPercentage > 0;
  const discountAmount = hasDiscount
    ? Math.round((finalTotal * discountPercentage) / 100)
    : 0;
  const displayTotal = hasDiscount
    ? Math.max(0, finalTotal - discountAmount)
    : finalTotal;
  return { finalTotal, discountPercentage, discountAmount, displayTotal, hasDiscount };
}

/** Sightseeing / cityArea places for a day (placeName + description). */
export function renderCityAreaHtml(cityArea, theme = 'ptw') {
  const items = (Array.isArray(cityArea) ? cityArea : []).filter(
    (a) => a && (a.placeName || a.description)
  );
  if (!items.length) return '';

  const rows = items
    .map((a) => {
      const title = esc(a.placeName || 'Place');
      const desc = a.description ? `<div class="ca-desc">${p2h(a.description)}</div>` : '';
      return `<div class="ca-item"><div class="ca-name">${title}</div>${desc}</div>`;
    })
    .join('');

  return `
  <div class="ca-block ca-${theme}">
    <div class="ca-title">Places &amp; Sightseeing</div>
    <div class="ca-list">${rows}</div>
  </div>`;
}

/** Alternate hotels: propertyName + rating. */
export function renderSimilarHotelsHtml(similarHotels, theme = 'ptw') {
  const items = (Array.isArray(similarHotels) ? similarHotels : []).filter(
    (h) => h && h.propertyName
  );
  if (!items.length) return '';

  const rows = items
    .map((h) => {
      const rating =
        h.rating != null && h.rating !== ''
          ? `<span class="sh-rating">${esc(h.rating)}★</span>`
          : '';
      return `<div class="sh-item"><span class="sh-name">${esc(h.propertyName)}</span>${rating}</div>`;
    })
    .join('');

  return `
  <div class="sh-block sh-${theme}">
    <div class="sh-title">Similar Hotels</div>
    <div class="sh-list">${rows}</div>
  </div>`;
}

/** Cover / cost-summary price HTML when discount may apply. */
export function renderPriceAmountHtml(pricing, opts = {}) {
  const { displayTotal, finalTotal, discountPercentage, hasDiscount } = pricing;
  const valueClass = opts.valueClass || 'pv';
  const noteClass = opts.noteClass || 'pn';
  if (!hasDiscount) {
    return `<div class="${valueClass}">${inr(displayTotal)}</div>
      <div class="${noteClass}">${opts.note || 'All inclusive'}</div>`;
  }
  return `
    <div class="price-was">${inr(finalTotal)}</div>
    <div class="${valueClass}">${inr(displayTotal)}</div>
    <div class="${noteClass}">${esc(discountPercentage)}% discount applied</div>`;
}

export function renderGrandTotalRows(pricing) {
  const { displayTotal, finalTotal, discountPercentage, hasDiscount } = pricing;
  if (!hasDiscount) {
    return `<div class="bill-row total tot"><span>Grand Total (Included Gst)</span><span>${inr(displayTotal)}</span></div>`;
  }
  return `
    <div class="bill-row"><span>Package Total (Included Gst)</span><span>${inr(finalTotal)}</span></div>
    <div class="bill-row"><span>Discount</span><span>${esc(discountPercentage)}%</span></div>
    <div class="bill-row total tot"><span>Grand Total (Included Gst)</span><span>${inr(displayTotal)}</span></div>`;
}

/** 3-up destination gallery above greeting (data URIs only). */
export function renderStateGalleryHtml(images) {
  const imgs = (Array.isArray(images) ? images : []).filter(Boolean);
  if (!imgs.length) return '';
  return `<div class="state-gallery">${imgs
    .map((src) => `<div class="sg-cell"><img src="${src}" alt=""/></div>`)
    .join('')}</div>`;
}

/** Executive / maker card shown above Inclusions & Exclusions. */
export function renderMakerCardHtml(maker) {
  if (!maker || typeof maker !== 'object') return '';
  const name = [maker.firstName, maker.lastName].filter(Boolean).join(' ').trim();
  if (!name && !maker.email && !maker.contactNo) return '';

  return `
  <div class="maker-card">
    <div class="maker-kicker">Your Travel Executive</div>
    <div class="maker-name">${esc(name || 'Travel Executive')}</div>
    <div class="maker-meta">
      ${maker.designation ? `<span>${esc(maker.designation)}</span>` : ''}
      ${maker.companyName ? `<span>${esc(maker.companyName)}</span>` : ''}
    </div>
    <div class="maker-contact">
      ${maker.contactNo ? `<span>${esc(maker.contactNo)}</span>` : ''}
      ${maker.email ? `<span>${esc(maker.email)}</span>` : ''}
    </div>
  </div>`;
}

/** Inline SVG icons — emoji fonts are often missing on Linux Chrome for PDF. */
export const icons = {
  hotel: (color = '#ffffff', size = 24) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 10h.01M15 10h.01M9 14h.01M15 14h.01" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  cab: (color = '#ffffff', size = 28) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 17h14v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2z" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M5 17 6.5 10.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 17M7 13h10" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="7.5" cy="17" r="1.2" fill="${color}"/>
      <circle cx="16.5" cy="17" r="1.2" fill="${color}"/>
    </svg>`,
  bed: (color = '#1a5fa8', size = 12) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px;margin-right:3px">
      <path d="M3 7v11M3 12h18v6M21 12V7M7 12V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  meal: (color = '#1a5fa8', size = 12) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px;margin-right:3px">
      <path d="M4 3v8a2 2 0 0 0 2 2h1v8M10 3v18M14 8h4a2 2 0 0 1 2 2v3h-6V8zM16 13v8" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  door: (color = '#1a5fa8', size = 12) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px;margin-right:3px">
      <path d="M5 3h10v18H5zM15 7h4v14M11 12h.01" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  check: (color = '#ffffff', size = 14) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 6 9 17l-5-5" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  list: (color = '#ffffff', size = 14) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  bank: (color = '#ffffff', size = 14) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 3 3 10h18L12 3z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  calendar: (color = '#ffffff', size = 14) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="${color}" stroke-width="2"/>
      <path d="M3 10h18M8 3v4M16 3v4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  money: (color = '#ffffff', size = 14) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="${color}" stroke-width="2"/>
      <circle cx="12" cy="12" r="2.5" stroke="${color}" stroke-width="2"/>
    </svg>`,
  pin: (color = '#f0d090', size = 12) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px;margin-right:3px">
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" stroke="${color}" stroke-width="2"/>
      <circle cx="12" cy="10" r="2.5" stroke="${color}" stroke-width="2"/>
    </svg>`,
  flag: (color = '#f0d090', size = 12) => `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px;margin-right:3px">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
};
