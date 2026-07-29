/**
 * Social + website links for PDF page footer / document footer.
 */
export const PDF_SOCIAL_LINKS = {
  ptw: {
    website: 'https://ptwholidays.in/',
    youtube: 'https://www.youtube.com/@PTWholidays',
    instagram: 'https://www.instagram.com/ptw_holidays/?hl=en',
    facebook: 'https://www.facebook.com/groups/129212239065814/',
  },
  demandsetu: {
    website: 'https://www.demandsetutours.com/',
    youtube: 'https://www.youtube.com/@demandsetutours',
    instagram: 'https://www.instagram.com/demandsetutours/?hl=en',
    facebook: 'https://www.facebook.com/p/DemandsetuTours-61554146676519/',
  },
};

function toSvgDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** Round brand icons — img data-URI works in Puppeteer footer (inline SVG often does not). */
const ICON_SVG = {
  website: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#0f766e"/><circle cx="14" cy="14" r="7.2" fill="none" stroke="#fff" stroke-width="1.6"/><ellipse cx="14" cy="14" rx="3.2" ry="7.2" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M7 14h14M14 7c2.2 1.8 3.4 4 3.4 7S16.2 19.2 14 21c-2.2-1.8-3.4-4-3.4-7S11.8 8.8 14 7z" fill="none" stroke="#fff" stroke-width="1.4"/></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><defs><linearGradient id="ig" x1="0" y1="28" x2="28" y2="0"><stop stop-color="#f58529"/><stop offset=".5" stop-color="#dd2a7b"/><stop offset="1" stop-color="#8134af"/></linearGradient></defs><circle cx="14" cy="14" r="14" fill="url(#ig)"/><rect x="7.5" y="7.5" width="13" height="13" rx="3.5" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="14" cy="14" r="3.2" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="18.4" cy="9.7" r="1.1" fill="#fff"/></svg>`,
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#1877F2"/><path d="M15.6 22v-7.2h2.4l.36-2.8h-2.76v-1.8c0-.8.22-1.35 1.38-1.35H18.5V6.1C18.1 6.05 16.9 5.95 15.5 5.95c-2.9 0-4.88 1.77-4.88 5V12H8v2.8h2.62V22h5z" fill="#fff"/></svg>`,
  youtube: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#FF0000"/><path d="M20.8 11.05c-.2-.75-.8-1.35-1.55-1.55C18 9.2 14 9.2 14 9.2s-4 0-5.25.3c-.75.2-1.35.8-1.55 1.55C7 12.3 7 14.5 7 14.5s0 2.2.2 3.45c.2.75.8 1.35 1.55 1.55C10 19.8 14 19.8 14 19.8s4 0 5.25-.3c.75-.2 1.35-.8 1.55-1.55.2-1.25.2-3.45.2-3.45s0-2.2-.2-3.45z" fill="#fff"/><path d="M12.7 16.7V12.3l3.8 2.2-3.8 2.2z" fill="#FF0000"/></svg>`,
};

const ICON_DATA = {
  website: toSvgDataUri(ICON_SVG.website),
  instagram: toSvgDataUri(ICON_SVG.instagram),
  facebook: toSvgDataUri(ICON_SVG.facebook),
  youtube: toSvgDataUri(ICON_SVG.youtube),
};

const SOCIAL_ORDER = [
  ['website', 'Website'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['youtube', 'YouTube'],
];

/**
 * Puppeteer footerTemplate — icons on every PDF page.
 * @param {'ptw'|'demandsetu'} brand
 */
export function buildPdfFooterTemplate(brand = 'ptw') {
  const links = PDF_SOCIAL_LINKS[brand] || PDF_SOCIAL_LINKS.ptw;

  const icon = (href, key, label) => `
    <a href="${href || '#'}" title="${label}" style="display:inline-block;margin:0 6px;text-decoration:none;vertical-align:middle;">
      <img src="${ICON_DATA[key]}" width="22" height="22" style="width:22px;height:22px;border:0;display:inline-block;vertical-align:middle;" alt="${label}"/>
    </a>`;

  return `
  <div style="width:100%;padding:2px 12mm 0;box-sizing:border-box;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
    <div style="border-top:1px solid #cbd5e1;padding-top:5px;line-height:22px;">
      ${SOCIAL_ORDER.map(([key, label]) => icon(links[key], key, label)).join('')}
    </div>
  </div>`;
}

/** In-document social row (also visible at end of content). */
export function renderSocialIconsHtml(brand = 'ptw') {
  const links = PDF_SOCIAL_LINKS[brand] || PDF_SOCIAL_LINKS.ptw;
  const item = (href, key, label) => `
    <a class="social-ico" href="${href || '#'}" title="${label}">
      <img src="${ICON_DATA[key]}" alt="${label}" width="28" height="28"/>
    </a>`;

  return `
  <div class="social-row">
    ${SOCIAL_ORDER.map(([key, label]) => item(links[key], key, label)).join('')}
  </div>`;
}
