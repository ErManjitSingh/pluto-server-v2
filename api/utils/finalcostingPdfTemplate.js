// ─── PTW Holidays – PDF Template ────────────────────────────────────────────

const LOGO_URL  = 'https://ptwholidays.in/_next/image?url=%2FPTW-Holidays-logo.png&w=256&q=75';
const BRAND     = 'PTW Holidays Pvt. Ltd.';
const TAGLINE   = 'WORLD TOURS DMC';
const PHONE     = '+91-9317258401';
const EMAIL     = 'info@ptwholidays.com';
const ADDRESS   = 'Sheryl Villa, 2nd Floor, Near Taste Buds Restaurant, Panthaghati, Shimla, HP 171009';

const BANK = {
  bank:   'STATE BANK OF INDIA',
  acc:    '38207849663',
  name:   'PT HOLIDAYS PVT. LTD.',
  branch: 'PANTHAGHATI-SHIMLA',
  ifsc:   'SBIN0021763',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inr(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}

function fmtDate(val) {
  if (!val) return 'Flexible';
  const d = new Date(val);
  if (isNaN(d)) return esc(val);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function p2h(text) {
  if (!text) return '';
  return esc(text).replace(/\n/g, '<br>');
}

function safeHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/\s*style="[^"]*background-color:\s*transparent[^"]*"/gi, '')
    .replace(/<span[^>]*>\s*<\/span>/gi, '');
}

function stripTags(str) {
  return String(str || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Split packageDescription into bordered blocks (one per h3 line). */
function formatPackageDescription(html) {
  const cleaned = safeHtml(html);
  if (!cleaned) return '';

  const items = [];
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let match;
  while ((match = h3Regex.exec(cleaned)) !== null) {
    const text = stripTags(match[1]);
    if (text) items.push(text);
  }

  if (!items.length) {
    const fallback = stripTags(cleaned);
    if (!fallback) return '';
    items.push(fallback);
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

/** Split ol/ul/li (or plain text) into bordered content blocks — same style as package overview. */
function formatContentBlocks(html) {
  const cleaned = safeHtml(html);
  if (!cleaned) return '<div class="pkg-desc-item"><div class="pkg-desc-item-text">—</div></div>';

  const items = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(cleaned)) !== null) {
    const text = stripTags(match[1]);
    if (text) items.push(text);
  }

  if (!items.length) {
    const parts = cleaned
      .split(/<\/p>|<br\s*\/?>/i)
      .map((p) => stripTags(p))
      .filter(Boolean);
    if (parts.length) items.push(...parts);
  }

  if (!items.length) {
    const fallback = stripTags(cleaned);
    if (fallback) items.push(fallback);
  }

  if (!items.length) {
    return '<div class="pkg-desc-item"><div class="pkg-desc-item-text">—</div></div>';
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

function getLead(op) {
  return op.transfer?.selectedLead || op.hotels?.[0]?.selectedLead || {};
}

function quoteId(op) {
  return String(op.id || op._id || 'Q').replace(/[^a-z0-9]/gi, '').slice(-10).toUpperCase();
}

// Build a Map: day → hotel entry
function hotelByDay(hotels) {
  const map = new Map();
  (hotels || []).forEach(h => map.set(Number(h.day), h));
  return map;
}

function renderHotelCard(hotel, opts = {}) {
  if (!hotel) return '';
  const forBreakdown = opts.breakdown === true;
  const thumb = hotel.pdfImage
    ? `<div class="hotel-thumb${forBreakdown ? ' hotel-thumb-lg' : ''}"><img src="${hotel.pdfImage}" alt=""/></div>`
    : `<div class="hotel-badge">🏨</div>`;

  if (forBreakdown) {
    return `
    <div class="hotel-row hotel-row-breakdown">
      <div class="hotel-details">
        <div class="hotel-name">${esc(hotel.propertyName)}</div>
        <div class="hotel-meta">Day ${esc(hotel.day)} · ${esc(hotel.cityName)}</div>
        <div class="hotel-tags">
          <span class="htag">🛏 ${esc(hotel.roomName)}</span>
          <span class="htag">🍽 ${esc(hotel.mealPlan || '—')}</span>
         
        </div>
      </div>
      ${thumb}
    </div>`;
  }

  return `
    <div class="hotel-row">
      ${thumb}
      <div class="hotel-details">
        <div class="hotel-name">${esc(hotel.propertyName)}</div>
        <div class="hotel-meta">Day ${esc(hotel.day)} · ${esc(hotel.cityName)}</div>
        <div class="hotel-tags">
          <span class="htag">🛏 ${esc(hotel.roomName)}</span>
          <span class="htag">🍽 ${esc(hotel.mealPlan || '—')}</span>
          <span class="htag">🚪 ${esc(hotel.roomcount || '1')} Room</span>
        </div>
      </div>
    </div>`;
}

function renderTransferCard(detail) {
  if (!detail) return '';
  const seats =
    detail.seatingCapacity ||
    (detail.cabSeatingCapacity ? `${detail.cabSeatingCapacity} Seater` : '—');
  const rawPrice = detail.price ?? detail.prices?.onSeasonPrice ?? detail.seasonalPricing?.onSeasonPrice;
  const priceLabel = rawPrice != null && rawPrice !== '' ? inr(rawPrice) : '—';
  return `
    <div class="transfer-row">
      <div class="transfer-badge">🚐</div>
      <div class="hotel-details">
        <div class="hotel-name">${esc(detail.cabName || detail.cabType || 'Transfer Vehicle')}</div>
        <div class="hotel-meta">${esc(detail.cabType || 'Cab')} · Full tour transfer</div>
        <div class="hotel-tags">
          <span class="htag">👥 ${esc(seats)}</span>
          ${detail.luggage ? `<span class="htag">🧳 ${esc(detail.luggage)}</span>` : ''}
          ${detail.quantity ? `<span class="htag">Qty ${esc(detail.quantity)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const CSS = `
  :root {
    --navy:  #0d2b4e;
    --blue:  #1a5fa8;
    --sky:   #e8f2fd;
    --gold:  #d4882a;
    --bg:    #f5f7fa;
    --line:  #dde3ea;
    --ink:   #1c2532;
    --muted: #5e6e82;
    --red:   #c0392b;
    --green: #1e7a45;
    --white: #ffffff;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:9.5px;line-height:1.55;color:var(--ink);background:#fff;}
  a{color:inherit;text-decoration:none;}

  /* ── Page header & footer ── */
  .pg-header{
    background:linear-gradient(135deg,#0b2442 0%, #123660 100%);
    color:#fff;
    padding:12px 18px 10px;
    display:flex;justify-content:space-between;align-items:center;
    margin-bottom:18px;
    border-radius:12px;
    box-shadow:0 12px 28px rgba(12,35,67,.16);
  }
  .pg-header-left{display:flex;align-items:center;gap:10px;}
  .pg-logo{
    height:44px;width:auto;max-width:160px;
    background:#fff;border-radius:6px;padding:4px 6px;
    object-fit:contain;display:block;
  }
  .pg-brand{line-height:1.3;}
  .pg-brand strong{font-size:12px;letter-spacing:.02em;}
  .pg-brand span{display:block;font-size:7.5px;opacity:.75;letter-spacing:.12em;}
  .pg-header-right{text-align:right;font-size:7.5px;opacity:.85;line-height:1.6;}

  /* ── Cover hero ── */
  .cover-hero{
    background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 60%,#2980b9 100%);
    color:#fff;border-radius:10px;padding:28px 24px 22px;margin-bottom:18px;
    position:relative;overflow:hidden;
    box-shadow:0 18px 34px rgba(15,47,87,.18);
  }
  .cover-hero::after{
    content:'';position:absolute;right:-30px;top:-40px;
    width:180px;height:180px;border-radius:50%;
    background:rgba(255,255,255,.07);
  }
  .cover-tag{
    display:inline-block;background:var(--gold);color:#fff;
    font-size:8px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;
    padding:4px 12px;border-radius:3px;margin-bottom:12px;
  }
  .cover-title{font-size:24px;font-weight:800;line-height:1.15;margin-bottom:6px;}
  .cover-sub{font-size:10px;opacity:.85;margin-bottom:16px;}
  .cover-chips{display:flex;flex-wrap:wrap;gap:7px;}
  .chip{
    background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.25);
    padding:4px 10px;border-radius:20px;font-size:8.5px;
  }
  .chip b{color:#f0d090;}
  .price-badge{
    position:absolute;right:24px;top:28px;
    background:#fff;color:var(--navy);border-radius:10px;
    padding:14px 18px;text-align:center;min-width:130px;
    box-shadow:0 6px 20px rgba(0,0,0,.18);
  }
  .price-badge .pl{font-size:7.5px;font-weight:700;letter-spacing:.12em;color:var(--muted);}
  .price-badge .pv{font-size:22px;font-weight:800;color:var(--gold);margin:4px 0;}
  .price-badge .pn{font-size:7px;color:var(--muted);}

  /* ── Guest strip ── */
  .guest-strip{
    display:flex;gap:10px;margin-bottom:18px;
    border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff;
    box-shadow:0 10px 24px rgba(28,37,50,.05);
  }
  .gs-cell{flex:1;padding:12px 14px;border-right:1px solid var(--line);}
  .gs-cell:last-child{border-right:none;}
  .gs-lbl{font-size:7.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
  .gs-val{font-size:11px;font-weight:700;margin-top:3px;color:var(--navy);}

  /* ── Route stepper ── */
  .route-wrap{background:linear-gradient(180deg,#f6fbff 0%, var(--sky) 100%);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:18px;box-shadow:0 8px 20px rgba(26,95,168,.06);}
  .route-lbl{font-size:7.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);margin-bottom:8px;}
  .route-steps{display:flex;flex-wrap:wrap;align-items:flex-start;gap:0;}
  .rs{text-align:center;padding:0 6px;min-width:60px;}
  .rs-dot{width:28px;height:28px;border-radius:50%;background:var(--blue);color:#fff;font-size:9px;font-weight:800;line-height:28px;margin:0 auto 5px;}
  .rs-name{font-size:8.5px;font-weight:700;color:var(--navy);}
  .rs-nights{font-size:7.5px;color:var(--muted);margin-top:1px;}
  .rs-arr{color:var(--line);font-size:16px;margin-top:10px;padding:0 2px;}

  /* ── Section heading ── */
  .sec-head{
    display:flex;align-items:center;gap:9px;
    padding:9px 13px;background:linear-gradient(135deg,#11345c 0%,#1c5ea1 100%);color:#fff;border-radius:10px;
    margin-bottom:12px;
    box-shadow:0 10px 22px rgba(17,52,92,.12);
  }
  .sec-head .ico{font-size:15px;}
  .sec-head h2{font-size:12px;font-weight:700;letter-spacing:.02em;}
  .sec-head .sub{font-size:8px;opacity:.75;margin-top:1px;}

  /* ── Day card (itinerary + hotel merged) ── */
  .day-card{
    border:1px solid var(--line);border-radius:10px;margin-bottom:14px;
    background:#fff;overflow:hidden;page-break-inside:avoid;
    box-shadow:0 10px 26px rgba(28,37,50,.06);
  }
  .day-header{
    display:flex;align-items:stretch;gap:0;
    background:linear-gradient(135deg,#0e2e54 0%,#194c86 100%);color:#fff;
  }
  .day-num{
    min-width:54px;padding:10px 8px;text-align:center;
    background:var(--gold);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;
  }
  .day-num .dn{font-size:18px;font-weight:800;line-height:1;}
  .day-num .dl{font-size:7px;letter-spacing:.14em;text-transform:uppercase;opacity:.9;margin-top:2px;}
  .day-info{flex:1;padding:10px 14px;}
  .day-info h3{font-size:11px;font-weight:700;margin-bottom:3px;}
  .day-info .city-tag{font-size:7.5px;opacity:.75;letter-spacing:.06em;}
  .day-body{padding:14px 14px 14px;}
  .day-desc{font-size:9px;color:#374151;line-height:1.68;margin-bottom:12px;}
  .day-summary{
    display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;
  }
  .day-pill{
    background:#f8fbff;border:1px solid #d7e6f7;color:#1b4f85;
    border-radius:999px;padding:4px 10px;font-size:7.8px;font-weight:700;
    letter-spacing:.04em;
  }

  /* hotel inside day */
  .hotel-row{
    display:flex;gap:12px;align-items:flex-start;
    background:linear-gradient(180deg,#fbfdff 0%, var(--sky) 100%);
    border:1px solid var(--line);border-radius:10px;padding:11px 12px;
  }
  .hotel-badge{
    width:56px;height:56px;flex-shrink:0;border-radius:12px;
    background:linear-gradient(135deg,#0f3767 0%,#1d67ad 100%);
    color:#fff;display:flex;align-items:center;justify-content:center;
    font-size:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,.15);
  }
  .hotel-thumb{
    width:72px;height:56px;flex-shrink:0;border-radius:10px;overflow:hidden;
    border:1px solid #c5d9ef;background:#eef3f8;
  }
  .hotel-thumb-lg{width:96px;height:72px;border-radius:12px;}
  .hotel-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
  .hotel-row-breakdown{align-items:center;}
  .hotel-row-breakdown .hotel-details{flex:1;}
  .hotel-details{flex:1;}
  .hotel-name{font-size:11px;font-weight:800;color:var(--navy);}
  .hotel-meta{font-size:8.5px;color:var(--muted);margin:3px 0 5px;}
  .hotel-tags{display:flex;gap:6px;flex-wrap:wrap;}
  .htag{
    background:#fff;border:1px solid #dbe6f0;
    padding:2px 8px;border-radius:12px;font-size:8px;font-weight:600;color:var(--navy);
  }
  .htag-price{border-color:#e8c99a;color:#9a5c12;font-weight:800;}
  .hotel-price{font-size:12px;font-weight:800;color:var(--gold);margin-top:6px;}

  .transfer-row{
    display:flex;gap:12px;align-items:flex-start;
    background:linear-gradient(180deg,#f5f9ff 0%, var(--sky) 100%);
    border:1px solid #b8cfe6;border-radius:10px;padding:11px 12px;margin-bottom:10px;
    page-break-inside:avoid;
  }
  .transfer-badge{
    width:48px;height:48px;flex-shrink:0;border-radius:14px;
    background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 100%);
    color:#fff;display:flex;align-items:center;justify-content:center;
    font-size:20px;
  }

  .pkg-desc-wrap{
    margin:18px 0;
    padding:16px 16px 14px;
    border-radius:12px;
    border:1px solid #b8cfe6;
    background:linear-gradient(165deg,#e3effb 0%,#f3f9ff 45%,#ffffff 100%);
    box-shadow:0 12px 28px rgba(17,52,92,.08);
    page-break-inside:auto;
  }
  .pkg-desc-title{
    font-size:11px;font-weight:800;color:var(--navy);margin-bottom:12px;
    letter-spacing:.08em;text-transform:uppercase;
    padding-bottom:8px;border-bottom:2px solid rgba(26,95,168,.15);
  }
  .pkg-desc-items{display:flex;flex-direction:column;gap:8px;}
  .pkg-desc-item{
    background:#fff;
    border:1px solid #c5d9ef;
    border-left:4px solid var(--gold);
    border-radius:8px;
    padding:10px 12px;
    box-shadow:0 4px 12px rgba(13,43,78,.06);
    page-break-inside:avoid;
  }
  .pkg-desc-item-text{
    font-size:9.5px;font-weight:700;color:#1a3d66;line-height:1.55;
  }

  .stack-block{margin-bottom:14px;}

  /* ── Pricing table ── */
  .bill-card{
    border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:18px;
    box-shadow:0 10px 24px rgba(28,37,50,.05);
  }
  .bill-row{display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid var(--line);font-size:9.5px;}
  .bill-row:last-child{border-bottom:none;}
  .bill-row.alt{background:var(--sky);}
  .bill-row.total{background:var(--navy);color:#fff;font-size:12px;font-weight:800;}
  .bill-row.total span:last-child{color:#f0d090;}

  /* ── Inc/Exc — same bordered content blocks as package overview ── */
  .ie-grid{display:flex;gap:14px;margin-bottom:18px;}
  .ie-col{
    flex:1;border-radius:12px;padding:14px 14px 12px;page-break-inside:auto;
    border:1px solid #b8cfe6;
    background:linear-gradient(165deg,#e3effb 0%,#f3f9ff 45%,#ffffff 100%);
    box-shadow:0 10px 24px rgba(17,52,92,.07);
  }
  .ie-col.inc{border-left:4px solid var(--green);}
  .ie-col.exc{border-left:4px solid var(--red);}
  .ie-head{
    font-size:11px;font-weight:800;margin-bottom:12px;
    letter-spacing:.08em;text-transform:uppercase;
    padding-bottom:8px;border-bottom:2px solid rgba(26,95,168,.15);
  }
  .ie-head.inc{color:var(--green);}
  .ie-head.exc{color:var(--red);}

  /* ── Policies ── */
  .policy{
    border:1px solid #b8cfe6;border-radius:12px;margin-bottom:12px;overflow:hidden;
    page-break-inside:auto;box-shadow:0 10px 24px rgba(17,52,92,.07);
    background:linear-gradient(165deg,#e3effb 0%,#f3f9ff 45%,#ffffff 100%);
  }
  .policy-head{
    background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 100%);
    color:#fff;padding:10px 14px;font-size:11px;font-weight:800;
    letter-spacing:.04em;text-transform:uppercase;
  }
  .policy-body{padding:12px 14px 14px;}

  .pkg-desc-item.policy-item{
    border-left-color:var(--blue);
  }

  /* ── Bank ── */
  .bank-card{
    border:1px solid #b8cfe6;border-radius:12px;overflow:hidden;margin-bottom:18px;
    box-shadow:0 12px 28px rgba(17,52,92,.08);
  }
  .bank-banner{
    background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 100%);
    color:#fff;padding:12px 16px;
  }
  .bank-banner .bb-t{font-size:12px;font-weight:800;letter-spacing:.04em;}
  .bank-banner .bb-s{font-size:8px;opacity:.85;margin-top:3px;}
  .bank-body{padding:14px 16px;background:linear-gradient(165deg,#e3effb 0%,#f8fbff 50%,#fff 100%);}
  .bank-single{
    background:#fff;border:1px solid #c5d9ef;border-left:4px solid var(--gold);
    border-radius:10px;padding:12px 14px;
  }
  .bank-single .bank-name{font-size:11px;font-weight:800;color:var(--navy);margin-bottom:10px;}
  .bank-grid{display:flex;gap:10px;flex-wrap:wrap;}
  .bk{width:calc(50% - 5px);}
  .bk .bl{font-size:7px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.08em;}
  .bk .bv{font-size:10px;font-weight:700;color:var(--navy);margin-top:2px;}

  /* ── Footer ── */
  .doc-footer{
    background:var(--navy);color:#fff;border-radius:10px;
    padding:16px 20px;text-align:center;margin-top:24px;
  }
  .doc-footer .fn{font-size:13px;font-weight:800;margin-bottom:4px;}
  .doc-footer .fc{font-size:8.5px;opacity:.85;margin-bottom:8px;}
  .doc-footer .fl{font-size:7.5px;opacity:.6;line-height:1.5;border-top:1px solid rgba(255,255,255,.15);padding-top:8px;margin-top:8px;}

  /* ── Greeting ── */
  .greeting{
    background:linear-gradient(135deg,#f0f7ff 0%,#fff 100%);
    border:1px solid var(--line);border-left:4px solid var(--gold);
    border-radius:8px;padding:14px 16px;margin-bottom:18px;
    font-size:9.5px;line-height:1.65;color:#374151;
    box-shadow:0 10px 24px rgba(28,37,50,.05);
  }
  .greeting strong{color:var(--navy);}
`;

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildFinalCostingPdfHtml(operation) {
  const pkg      = operation.package || {};
  const lead     = getLead(operation);
  const itinDays = pkg.itineraryDays?.length ? pkg.itineraryDays : (operation.transfer?.itineraryDays || []);
  const hotels   = operation.hotels || [];
  const totals   = operation.totals || {};
  const cab      = operation.transfer?.details?.[0];
  const transferDetails = operation.transfer?.details || [];
  const cabName  = cab?.cabName || cab?.cabType || '—';
  const cabSeats = cab?.seatingCapacity || cab?.cabSeatingCapacity || '—';
  const places   = pkg.packagePlaces || [];
  const finalTotal = Number(operation.finalTotal) || 0;
  const subtotal   = Number(totals.grandTotal ?? operation.total) || 0;
  const marginAmt  = Math.max(0, finalTotal - subtotal);
  const ref        = quoteId(operation);
  const generated  = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

  const hotelMap = hotelByDay(hotels);
  const policies = pkg.customExclusions || [];

  // ── Page header HTML (reused) ────────────────────────────────────────────
  const pgHeader = `
  <div class="pg-header">
    <div class="pg-header-left">
      <img src="${LOGO_URL}" class="pg-logo" alt="PTW Holidays"/>
      <div class="pg-brand"><strong>${BRAND}</strong><span>${TAGLINE}</span></div>
    </div>
    <div class="pg-header-right">
      ${PHONE} &nbsp;·&nbsp; ${EMAIL}<br/>
      ${ADDRESS}
    </div>
  </div>`;

  // ── Cover section ────────────────────────────────────────────────────────
  const routeSteps = places.map((p, i) => `
    <div class="rs">
      <div class="rs-dot">${i + 1}</div>
      <div class="rs-name">${esc(p.placeCover)}</div>
      ${p.nights ? `<div class="rs-nights">${p.nights} night${p.nights > 1 ? 's' : ''}</div>` : ''}
    </div>
    ${i < places.length - 1 ? '<span class="rs-arr">›</span>' : ''}
  `).join('');

  const cover = `
  <div class="cover-hero">
    <div class="price-badge">
      <div class="pl">TOTAL PRICE</div>
      <div class="pl">incl. GST</div>
      <div class="pv">${inr(finalTotal)}</div>
      <div class="pn">All inclusive</div>
    </div>
    ${(pkg.tags || []).includes('trending') ? '<span class="cover-tag">🔥 Trending</span>' : '<span class="cover-tag">✈ Custom Package</span>'}
    <div class="cover-title">${esc(pkg.packageName || 'Your Himachal Package')}</div>
    <div class="cover-sub">${esc(pkg.state || '')} · ${esc(pkg.duration || '')} · ${esc(pkg.packageType || 'Custom')}</div>
    <div class="cover-chips">
      ${pkg.pickupLocation ? `<span class="chip">📍 Pickup: <b>${esc(pkg.pickupLocation)}</b></span>` : ''}
      ${pkg.dropLocation   ? `<span class="chip">🏁 Drop: <b>${esc(pkg.dropLocation)}</b></span>`   : ''}
      ${lead.travelDate    ? `<span class="chip">📅 Travel: <b>${fmtDate(lead.travelDate)}</b></span>` : ''}
      <span class="chip">🚗 <b>${esc(cabName)}</b></span>
    </div>
  </div>`;

  // ── Guest strip ──────────────────────────────────────────────────────────
  const guestStrip = `
  <div class="guest-strip">
    <div class="gs-cell"><div class="gs-lbl">Guest Name</div><div class="gs-val">${esc(lead.name || '—')}</div></div>
    <div class="gs-cell"><div class="gs-lbl">Contact</div><div class="gs-val">${esc(lead.mobile || '—')}</div></div>
    <div class="gs-cell"><div class="gs-lbl">Email</div><div class="gs-val">${esc(lead.email || '—')}</div></div>
    <div class="gs-cell"><div class="gs-lbl">Travel Date</div><div class="gs-val">${fmtDate(lead.travelDate)}</div></div>
    <div class="gs-cell"><div class="gs-lbl">Duration</div><div class="gs-val">${esc(pkg.duration || `${lead.days || ''}D`)}</div></div>
    <div class="gs-cell"><div class="gs-lbl">Rooms</div><div class="gs-val">${esc(lead.noOfRooms || '1')}</div></div>
  </div>`;

  // ── Greeting ─────────────────────────────────────────────────────────────
  const greeting = `
  <div class="greeting">
    Dear <strong>${esc(lead.name || 'Guest')}</strong>,<br/><br/>
    Thank you for choosing <strong>${BRAND}</strong> for your upcoming ${esc(pkg.state || 'Himachal')} adventure.
    We are delighted to present this personalised <strong>${esc(pkg.duration || '')}</strong> itinerary — carefully crafted
    to give you the perfect blend of scenic landscapes, comfortable stays, and seamless travel.
    Our team is dedicated to ensuring every moment of your journey is memorable.<br/><br/>
    Please review your complete package details below, and feel free to reach out to us for any customisations.
    <strong>We look forward to serving you!</strong>
  </div>`;

  // ── Route stepper ────────────────────────────────────────────────────────
  const routeSection = places.length ? `
  <div class="route-wrap">
    <div class="route-lbl">🗺 Your Journey Route</div>
    <div class="route-steps">${routeSteps}</div>
  </div>` : '';

  const packageDescriptionSection = pkg.packageDescription ? `
  <div class="pkg-desc-wrap">
    <div class="pkg-desc-title">Package Overview</div>
    ${formatPackageDescription(pkg.packageDescription)}
  </div>` : '';

  const hotelBreakdownCards = hotels.length
    ? hotels.map((h) => `<div class="stack-block">${renderHotelCard(h, { breakdown: true })}</div>`).join('')
    : '';

  const hotelBreakdown = hotels.length ? `
  <div class="sec-head"><span class="ico">🏩</span><div><h2>Hotel-wise Breakdown</h2><div class="sub">Confirmed stays night by night</div></div></div>
  ${hotelBreakdownCards}` : '';

  const transferCards = transferDetails.map((d) => renderTransferCard(d)).join('');
  const transferSection = transferDetails.length ? `
  <div class="sec-head"><span class="ico">🚐</span><div><h2>Transfer Details</h2><div class="sub">Vehicle assigned for your journey</div></div></div>
  ${transferCards}` : '';
  
  // ── Day-wise itinerary + hotel ───────────────────────────────────────────
  const dayCards = itinDays.map((dayEntry) => {
    const it      = dayEntry.selectedItinerary || {};
    const dayNum  = dayEntry.day;
    const hotel   = hotelMap.get(Number(dayNum));
    const hotelHtml = hotel ? renderHotelCard(hotel) : '';

    return `
    <div class="day-card">
      <div class="day-header">
        <div class="day-num">
          <div class="dn">${esc(dayNum)}</div>
          <div class="dl">Day</div>
        </div>
        <div class="day-info">
          <h3>${esc(it.itineraryTitle || `Day ${dayNum}`)}</h3>
          <div class="city-tag">${esc((it.cityName || '').toUpperCase())}</div>
        </div>
      </div>
      <div class="day-body">
        <div class="day-summary">
          <span class="day-pill">Day ${esc(dayNum)}</span>
          ${it.cityName ? `<span class="day-pill">Stay in ${esc(it.cityName)}</span>` : ''}
          ${hotel ? `<span class="day-pill">Hotel Confirmed</span>` : `<span class="day-pill">Leisure / Transit</span>`}
        </div>
        ${it.itineraryDescription ? `<div class="day-desc">${p2h(it.itineraryDescription)}</div>` : ''}
        ${hotelHtml}
      </div>
    </div>`;
  }).join('');

 

  // ── Pricing ──────────────────────────────────────────────────────────────
  const pricing = `
  <div class="sec-head"><span class="ico">💰</span><div><h2>Cost Summary</h2><div class="sub">Transparent pricing breakdown</div></div></div>
  <div class="bill-card">
     <div class="bill-row total"><span>Grand Total (Included Gst)</span><span>${inr(finalTotal)}</span></div>
  </div>`;

  // ── Inclusions / Exclusions ──────────────────────────────────────────────
  const incExc = (pkg.packageInclusions || pkg.packageExclusions) ? `
  <div class="sec-head"><span class="ico">✅</span><div><h2>Inclusions &amp; Exclusions</h2></div></div>
  <div class="ie-grid">
    <div class="ie-col inc">
      <div class="ie-head inc">Inclusions</div>
      ${formatContentBlocks(pkg.packageInclusions)}
    </div>
    <div class="ie-col exc">
      <div class="ie-head exc">Exclusions</div>
      ${formatContentBlocks(pkg.packageExclusions)}
    </div>
  </div>` : '';

  // ── Policies (customExclusions) ──────────────────────────────────────────
  const policyHtml = policies.map(p => `
  <div class="policy">
    <div class="policy-head">${esc(p.name)}</div>
    <div class="policy-body">${formatContentBlocks(p.description)}</div>
  </div>`).join('');

  const policiesSection = policyHtml ? `
  <div class="sec-head"><span class="ico">📋</span><div><h2>Policies &amp; Terms</h2></div></div>
  ${policyHtml}` : '';

  // ── Bank ─────────────────────────────────────────────────────────────────
  const bankSection = `
  <div class="sec-head"><span class="ico">🏦</span><div><h2>Payment Details</h2><div class="sub">Secure bank transfer information</div></div></div>
  <div class="bank-card">
    <div class="bank-banner">
      <div class="bb-t">Bank Details</div>
      <div class="bb-s">Secure payment information for your booking</div>
    </div>
    <div class="bank-body">
      <div class="bank-single">
        <div class="bank-name">${BANK.bank}</div>
        <div class="bank-grid">
          <div class="bk"><div class="bl">A/C No</div><div class="bv">${BANK.acc}</div></div>
          <div class="bk"><div class="bl">A/C Name</div><div class="bv">${BANK.name}</div></div>
          <div class="bk"><div class="bl">Branch</div><div class="bv">${BANK.branch}</div></div>
          <div class="bk"><div class="bl">IFSC Code</div><div class="bv">${BANK.ifsc}</div></div>
        </div>
      </div>
    </div>
  </div>`;

  // ── Footer ───────────────────────────────────────────────────────────────
  const footer = `
  <div class="doc-footer">
    <div class="fn">${BRAND} — ${TAGLINE}</div>
    <div class="fc">${PHONE} &nbsp;|&nbsp; ${EMAIL}</div>
    <div class="fc" style="font-size:8px;opacity:.7">${ADDRESS}</div>
    <div class="fl">
      Quote Ref: ${esc(ref)} &nbsp;·&nbsp; Generated: ${esc(generated)}<br/>
      This is a computer-generated quotation. Rates are subject to availability at the time of booking confirmation.
      Itinerary may be adjusted for weather or road conditions; equivalent alternatives will be provided.
    </div>
  </div>`;

  // ── Assemble ─────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(pkg.packageName || 'Travel Quotation')} – ${BRAND}</title>
  <style>${CSS}</style>
</head>
<body>
  ${pgHeader}
  ${cover}
  ${guestStrip}
  ${greeting}
  ${routeSection}

  ${packageDescriptionSection}
  ${hotelBreakdown}
  ${transferSection}

  <div class="sec-head"><span class="ico">📅</span><div><h2>Day-wise Itinerary &amp; Stays</h2><div class="sub">Each day planned with matching hotel</div></div></div>
  ${dayCards}

  ${pricing}
  ${incExc}
  ${policiesSection}
  ${bankSection}
  ${footer}
</body>
</html>`;
}
