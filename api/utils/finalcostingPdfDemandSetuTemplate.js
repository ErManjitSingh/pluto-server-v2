// ─── Demand Setu Tours – Orange PDF Template (distinct from PTW) ─────────────

export const DEMANDSETU_LOGO_URL =
  'https://www.demandsetutours.com/_next/image?url=%2Flogo.png&w=256&q=75';

const BRAND   = 'Demand Setu Tours';
const TAGLINE = 'YOUR BRIDGE TO THE WORLD';
const PHONE   = '+91 8353056000';
const EMAIL   = 'info@demandsetutours.com';
const ADDRESS =
  'First floor, Mother Bindra Tower, 39 mile, Shahpur, Himachal Pradesh 176206';

const BANKS = [
  {
    short: 'PNB',
    bank: 'Punjab National Bank',
    acc: '0894002100008473',
    name: 'DEMAND SETU',
    type: 'Current',
    ifsc: 'PUNB0089400',
  },
  {
    short: 'HDFC',
    bank: 'HDFC Bank',
    acc: '50200092959140',
    name: 'DEMAND SETU',
    type: 'Current',
    ifsc: 'HDFC0004116',
  },
  {
    short: 'AXIS',
    bank: 'Axis Bank',
    acc: '920020015004799',
    name: 'DEMAND SETU',
    type: 'Current',
    ifsc: 'UTIB0003277',
  },
];

function ordinalNight(n) {
  const num = Number(n) || 0;
  const j = num % 10;
  const k = num % 100;
  let suffix = 'th';
  if (j === 1 && k !== 11) suffix = 'st';
  else if (j === 2 && k !== 12) suffix = 'nd';
  else if (j === 3 && k !== 13) suffix = 'rd';
  return `${num}${suffix} Night`;
}

function checkInLabel(travelDate, dayNum) {
  if (!travelDate) return '';
  const d = new Date(travelDate);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (Number(dayNum) || 1) - 1);
  return `Check-in on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

function renderItineraryHotelCard(hotel, travelDate) {
  if (!hotel) return '';
  const night = ordinalNight(hotel.day);
  const city = hotel.cityName || '';
  const checkIn = checkInLabel(travelDate, hotel.day);
  const media = hotel.pdfImage
    ? `<div class="stay-logo-box"><img src="${hotel.pdfImage}" alt="" class="stay-photo"/></div>`
    : `<div class="stay-logo-box stay-icon-fallback">🏨</div>`;
  return `
    <div class="stay-card">
      <div class="stay-left">
        <div class="stay-top">
          <span class="stay-badge">${esc(night)}</span>
          ${city ? `<span class="stay-at">at <b>${esc(city)}</b></span>` : ''}
        </div>
        ${checkIn ? `<div class="stay-checkin">${esc(checkIn)}</div>` : ''}
        <div class="stay-name">${esc(hotel.propertyName)}</div>
        <div class="stay-meta">
          <div class="stay-meta-col">
            <div class="stay-meta-lbl">Rooms</div>
            <div class="stay-meta-val">${esc(hotel.roomName || '—')}</div>
          </div>
          <div class="stay-meta-col">
            <div class="stay-meta-lbl">Meal Plan</div>
            <div class="stay-meta-val">${esc(hotel.mealPlan || '—')}</div>
          </div>
        </div>
      </div>
      ${media}
    </div>`;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inr(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(val) {
  if (!val) return 'Flexible';
  const d = new Date(val);
  if (isNaN(d)) return esc(val);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
  return String(str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    if (fallback) items.push(fallback);
  }
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

/** Split ol/ul/li into bordered orange content blocks (same idea as package overview). */
function formatContentBlocks(html) {
  const cleaned = safeHtml(html);
  if (!cleaned) {
    return '<div class="ov-item"><span class="ov-text">—</span></div>';
  }

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
    return '<div class="ov-item"><span class="ov-text">—</span></div>';
  }

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

function getLead(op) {
  return op.transfer?.selectedLead || op.hotels?.[0]?.selectedLead || {};
}

function quoteId(op) {
  return String(op.id || op._id || 'Q')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-10)
    .toUpperCase();
}

function hotelByDay(hotels) {
  const map = new Map();
  (hotels || []).forEach((h) => map.set(Number(h.day), h));
  return map;
}

const CSS = `
  :root{
    --orange:#e85d04;
    --orange-deep:#c2410c;
    --orange-soft:#fff4eb;
    --orange-mid:#fdba74;
    --ink:#1a1a1a;
    --muted:#6b7280;
    --line:#e5e7eb;
    --dark:#111827;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{
    font-family:Georgia,'Times New Roman',serif;
    font-size:9.5px;line-height:1.55;color:var(--ink);background:#fff;
  }
  .sans{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}

  /* Top orange ribbon + white brand bar */
  .top-ribbon{
    height:6px;background:linear-gradient(90deg,#ea580c,#f97316,#fb923c);
    margin:-2mm -2mm 0;border-radius:0;
  }
  .brand-bar{
    display:flex;justify-content:space-between;align-items:center;
    padding:14px 4px 16px;border-bottom:2px solid var(--orange);
    margin-bottom:18px;
  }
  .brand-left{display:flex;align-items:center;gap:12px;}
  .brand-logo{
    height:48px;width:auto;max-width:180px;
    object-fit:contain;display:block;
    background:#111;border-radius:6px;padding:4px 8px;
  }
  .brand-name{font-family:'Segoe UI',Arial,sans-serif;}
  .brand-name strong{display:block;font-size:15px;color:var(--orange);letter-spacing:.02em;}
  .brand-name span{display:block;font-size:7.5px;color:var(--muted);letter-spacing:.14em;margin-top:2px;}
  .brand-contact{
    text-align:right;font-family:'Segoe UI',Arial,sans-serif;
    font-size:7.5px;color:var(--muted);line-height:1.65;max-width:240px;
  }
  .brand-contact b{color:var(--dark);font-size:9px;}

  /* Magazine-style title block */
  .quote-masthead{
    margin-bottom:16px;padding-bottom:14px;
    border-bottom:1px solid var(--line);
  }
  .quote-label{
    font-family:'Segoe UI',Arial,sans-serif;
    font-size:8px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;
    color:var(--orange);margin-bottom:6px;
  }
  .quote-title{
    font-size:22px;font-weight:700;line-height:1.2;color:var(--dark);
    margin-bottom:8px;
  }
  .quote-meta{
    font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:var(--muted);
  }
  .quote-meta b{color:var(--dark);}

  /* Full-width orange price band */
  .price-band{
    background:linear-gradient(90deg,#c2410c 0%,#ea580c 50%,#f97316 100%);
    color:#fff;border-radius:4px;padding:14px 18px;margin-bottom:16px;
    display:flex;justify-content:space-between;align-items:center;
    font-family:'Segoe UI',Arial,sans-serif;
  }
  .price-band .pb-l{font-size:8px;letter-spacing:.16em;text-transform:uppercase;opacity:.9;}
  .price-band .pb-t{font-size:11px;margin-top:3px;opacity:.95;}
  .price-band .pb-v{font-size:26px;font-weight:800;letter-spacing:-.02em;}
  .price-band .pb-n{font-size:7.5px;opacity:.85;text-align:right;margin-top:2px;}

  /* Guest facts as 2x3 grid cards */
  .facts{
    display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;
    font-family:'Segoe UI',Arial,sans-serif;
  }
  .fact{
    width:calc(33.33% - 6px);
    background:var(--orange-soft);border:1px solid #fed7aa;
    border-radius:6px;padding:10px 12px;
  }
  .fact .fl{font-size:7px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--orange-deep);}
  .fact .fv{font-size:11px;font-weight:700;color:var(--dark);margin-top:4px;}

  .hello{
    font-size:10px;line-height:1.7;color:#374151;margin-bottom:18px;
    padding:12px 0 12px 14px;border-left:3px solid var(--orange);
  }
  .hello strong{color:var(--orange-deep);}

  /* Route as horizontal orange pills */
  .route-box{margin-bottom:18px;font-family:'Segoe UI',Arial,sans-serif;}
  .route-h{
    font-size:8px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;
    color:var(--orange);margin-bottom:8px;
  }
  .route-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
  .rpill{
    background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);
    color:#fff;border-radius:6px;
    padding:7px 11px;font-size:8.5px;font-weight:700;
    box-shadow:0 4px 10px rgba(234,88,12,.22);
  }
  .rpill span{display:block;font-size:7px;font-weight:500;opacity:.9;margin-top:1px;}
  .rarrow{color:var(--orange);font-size:14px;font-weight:700;}

  /* Section title — underlined orange style */
  .sec{
    font-family:'Segoe UI',Arial,sans-serif;
    font-size:13px;font-weight:800;color:var(--dark);
    margin:20px 0 12px;padding-bottom:6px;
    border-bottom:3px solid var(--orange);display:inline-block;
  }
  .sec-block{margin-bottom:8px;}

  /* Overview list */
  .ov-wrap{
    background:var(--orange-soft);border:1px solid #fdba74;border-radius:8px;
    padding:12px;margin-bottom:16px;
  }
  .ov-item{
    display:flex;gap:10px;align-items:flex-start;
    background:#fff;border:1px solid #fed7aa;border-radius:6px;
    padding:9px 11px;margin-bottom:7px;page-break-inside:avoid;
  }
  .ov-item:last-child{margin-bottom:0;}
  .ov-num{
    font-family:'Segoe UI',Arial,sans-serif;
    font-size:11px;font-weight:800;color:var(--orange);min-width:22px;
  }
  .ov-text{font-family:'Segoe UI',Arial,sans-serif;font-size:9.5px;font-weight:600;color:var(--dark);}

  /* Hotel cards — orange left bar, table-ish */
  .hcard{
    display:flex;border:1px solid #fdba74;border-radius:8px;overflow:hidden;
    margin-bottom:10px;background:#fff;page-break-inside:avoid;
    font-family:'Segoe UI',Arial,sans-serif;
  }
  .hcard-day{
    width:52px;background:var(--orange);color:#fff;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:10px 4px;
  }
  .hcard-day .n{font-size:18px;font-weight:800;line-height:1;}
  .hcard-day .l{font-size:6.5px;letter-spacing:.12em;text-transform:uppercase;margin-top:3px;opacity:.9;}
  .hcard-body{flex:1;padding:10px 12px;}
  .hcard-thumb{
    width:88px;height:68px;flex-shrink:0;border-radius:10px;overflow:hidden;
    border:1px solid #fed7aa;background:#fff7ed;margin-left:auto;
  }
  .hcard-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
  .hcard-thumb-icon{
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#ea580c,#f97316);color:#fff;font-size:26px;
    border-color:#fdba74;
  }
  .hcard-name{font-size:11.5px;font-weight:800;color:var(--dark);}
  .hcard-city{font-size:8px;color:var(--muted);margin:2px 0 8px;}
  .hcard-grid{display:flex;gap:8px;flex-wrap:wrap;}
  .hchip{
    background:var(--orange-soft);border:1px solid #fed7aa;border-radius:4px;
    padding:4px 8px;font-size:8px;font-weight:600;color:var(--orange-deep);
  }
  .hchip.price{background:#fff;border-color:#fdba74;color:var(--orange);font-weight:800;}

  /* Transfer — big decorative orange card */
  .tcard{
    position:relative;overflow:hidden;
    background:linear-gradient(120deg,#c2410c 0%,#ea580c 40%,#f97316 75%,#fb923c 100%);
    color:#fff;border-radius:16px;padding:22px 20px;
    margin-bottom:16px;font-family:'Segoe UI',Arial,sans-serif;
    display:flex;justify-content:space-between;align-items:center;gap:16px;
    page-break-inside:avoid;
    box-shadow:0 14px 32px rgba(234,88,12,.28);
    border:1px solid rgba(255,255,255,.18);
  }
  .tcard::before{
    content:'';position:absolute;left:-40px;top:-50px;width:140px;height:140px;
    border-radius:50%;background:rgba(255,255,255,.1);
  }
  .tcard::after{
    content:'';position:absolute;right:70px;bottom:-60px;width:160px;height:160px;
    border-radius:50%;background:rgba(255,255,255,.08);
  }
  .tcard-left{position:relative;z-index:1;flex:1;min-width:0;}
  .tcard-kicker{
    display:inline-block;font-size:8px;font-weight:800;letter-spacing:.16em;
    text-transform:uppercase;background:rgba(255,255,255,.18);
    border:1px solid rgba(255,255,255,.28);border-radius:999px;
    padding:4px 10px;margin-bottom:10px;
  }
  .tcard .tn{font-size:18px;font-weight:800;line-height:1.2;letter-spacing:.01em;}
  .tcard .tm{font-size:10px;opacity:.95;margin-top:8px;line-height:1.45;}
  .tcard-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}
  .tchip{
    background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);
    border-radius:8px;padding:5px 10px;font-size:8.5px;font-weight:700;
  }
  .tcard-icon{
    position:relative;z-index:1;flex-shrink:0;
    width:72px;height:72px;border-radius:18px;
    background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);
    display:flex;align-items:center;justify-content:center;
    font-size:34px;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.25);
  }

  /* Timeline itinerary */
  .tl{position:relative;padding-left:28px;margin-bottom:8px;}
  .tl::before{
    content:'';position:absolute;left:9px;top:8px;bottom:8px;width:2px;
    background:linear-gradient(180deg,var(--orange),#fed7aa);
  }
  .tl-day{position:relative;margin-bottom:14px;page-break-inside:avoid;}
  .tl-dot{
    position:absolute;left:-28px;top:4px;width:20px;height:20px;
    border-radius:50%;background:var(--orange);color:#fff;
    font-family:'Segoe UI',Arial,sans-serif;font-size:8px;font-weight:800;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 0 0 2px var(--orange);
  }
  .tl-card{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff;}
  .tl-head{
    background:var(--orange-soft);padding:8px 12px;
    border-bottom:1px solid #fed7aa;
    font-family:'Segoe UI',Arial,sans-serif;
  }
  .tl-head h3{font-size:11px;font-weight:800;color:var(--dark);}
  .tl-head .city{font-size:7.5px;color:var(--orange-deep);letter-spacing:.08em;text-transform:uppercase;margin-top:2px;}
  .tl-body{padding:10px 12px;}
  .tl-desc{font-size:9px;line-height:1.65;color:#374151;margin-bottom:8px;}

  /* Hotel stay card inside itinerary (orange theme) */
  .stay-card{
    display:flex;justify-content:space-between;align-items:stretch;gap:12px;
    background:#fff;border:1px solid #fed7aa;border-radius:10px;
    padding:12px 14px;margin-top:4px;page-break-inside:avoid;
    font-family:'Segoe UI',Arial,sans-serif;
    box-shadow:0 6px 16px rgba(234,88,12,.08);
  }
  .stay-left{flex:1;min-width:0;}
  .stay-top{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;}
  .stay-badge{
    display:inline-block;background:#fff4eb;color:#c2410c;
    border:1px solid #fdba74;border-radius:999px;
    padding:3px 10px;font-size:8px;font-weight:700;
  }
  .stay-at{font-size:9px;color:#6b7280;}
  .stay-at b{color:#111827;font-weight:800;}
  .stay-checkin{font-size:8px;color:#9ca3af;margin-bottom:6px;}
  .stay-name{font-size:13px;font-weight:800;color:#c2410c;margin-bottom:10px;line-height:1.25;}
  .stay-meta{display:flex;gap:28px;}
  .stay-meta-lbl{font-size:7px;text-transform:uppercase;letter-spacing:.12em;color:#9ca3af;font-weight:700;}
  .stay-meta-val{font-size:10px;font-weight:800;color:#111827;margin-top:3px;}
  .stay-logo-box{
    width:72px;height:72px;flex-shrink:0;border-radius:10px;
    border:1px solid #e5e7eb;background:#fafafa;
    display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden;
  }
  .stay-photo{width:100%;height:100%;object-fit:cover;display:block;}
  .stay-icon-fallback{
    background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);
    color:#fff;font-size:28px;border-color:#fdba74;
  }

  /* Cost table */
  .bill{
    border:1px solid #fdba74;border-radius:8px;overflow:hidden;
    margin-bottom:16px;font-family:'Segoe UI',Arial,sans-serif;
  }
  .bill-row{
    display:flex;justify-content:space-between;padding:9px 14px;
    border-bottom:1px solid #fed7aa;font-size:9.5px;
  }
  .bill-row:last-child{border-bottom:none;}
  .bill-row.alt{background:var(--orange-soft);}
  .bill-row.tot{background:var(--orange);color:#fff;font-size:12px;font-weight:800;}

  /* Inc / Exc / Policies — bordered content like overview */
  .ie{display:flex;gap:12px;margin-bottom:16px;font-family:'Segoe UI',Arial,sans-serif;}
  .ie-col{
    flex:1;border-radius:8px;padding:12px;
    background:var(--orange-soft);border:1px solid #fdba74;
  }
  .ie-col.inc{border-left:4px solid #16a34a;}
  .ie-col.exc{border-left:4px solid #dc2626;}
  .ie-h{
    font-size:11px;font-weight:800;margin-bottom:10px;
    letter-spacing:.08em;text-transform:uppercase;
    padding-bottom:7px;border-bottom:2px solid rgba(234,88,12,.2);
  }
  .ie-h.inc{color:#16a34a;}
  .ie-h.exc{color:#dc2626;}
  .ie-h.theme{color:var(--orange-deep);}

  .pol{
    background:var(--orange-soft);border:1px solid #fdba74;border-radius:8px;
    margin-bottom:12px;overflow:hidden;padding:0 0 10px;
  }
  .pol-h{
    background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);
    color:#fff;padding:10px 12px;
    font-family:'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;
    letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px;
  }
  .pol-h span{color:#fff7ed;}
  .pol-b{padding:0 10px;}

  .bank{
    border:1px solid #fdba74;border-radius:10px;overflow:hidden;margin-bottom:16px;
    font-family:'Segoe UI',Arial,sans-serif;
    box-shadow:0 10px 24px rgba(234,88,12,.1);
  }
  .bank-banner{
    background:linear-gradient(135deg,#c2410c 0%,#ea580c 50%,#f97316 100%);
    color:#fff;padding:12px 14px;
  }
  .bank-banner .bb-t{font-size:12px;font-weight:800;}
  .bank-banner .bb-s{font-size:8px;opacity:.9;margin-top:3px;}
  .bank-body{
    padding:12px;background:linear-gradient(180deg,#fff7ed 0%,#fff 60%);
    display:flex;flex-direction:column;gap:10px;
  }
  .bank-card-item{
    background:#fff;border:1px solid #fed7aa;border-left:4px solid var(--orange);
    border-radius:8px;padding:11px 12px;page-break-inside:avoid;
  }
  .bank-card-item .bci-head{
    display:flex;align-items:center;gap:8px;margin-bottom:8px;
  }
  .bank-card-item .bci-tag{
    background:var(--orange);color:#fff;font-size:7px;font-weight:800;
    letter-spacing:.08em;padding:3px 7px;border-radius:4px;
  }
  .bank-card-item .bci-name{font-size:10.5px;font-weight:800;color:var(--dark);}
  .bank-grid{display:flex;flex-wrap:wrap;gap:8px;}
  .bk{width:calc(50% - 4px);}
  .bk .bl{font-size:7px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;}
  .bk .bv{font-size:10px;font-weight:700;color:var(--dark);margin-top:2px;}

  .foot{
    margin-top:20px;padding:16px;text-align:center;
    background:linear-gradient(135deg,#c2410c 0%,#ea580c 45%,#f97316 100%);
    color:#fff;border-radius:8px;
    font-family:'Segoe UI',Arial,sans-serif;
    box-shadow:0 12px 28px rgba(234,88,12,.22);
  }
  .foot .fn{font-size:13px;font-weight:800;color:#fff7ed;margin-bottom:4px;}
  .foot .fc{font-size:8.5px;opacity:.92;margin-bottom:4px;}
  .foot .fl{font-size:7.5px;opacity:.75;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.25);line-height:1.5;}
`;

export function buildDemandSetuPdfHtml(operation) {
  const pkg = operation.package || {};
  const lead = getLead(operation);
  const itinDays = pkg.itineraryDays?.length
    ? pkg.itineraryDays
    : operation.transfer?.itineraryDays || [];
  const hotels = operation.hotels || [];
  const totals = operation.totals || {};
  const transferDetails = operation.transfer?.details || [];
  const cab = transferDetails[0];
  const cabName = cab?.cabName || cab?.cabType || '—';
  const places = pkg.packagePlaces || [];
  const finalTotal = Number(operation.finalTotal) || 0;
  const subtotal = Number(totals.grandTotal ?? operation.total) || 0;
  const marginAmt = Math.max(0, finalTotal - subtotal);
  const ref = quoteId(operation);
  const generated = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const hotelMap = hotelByDay(hotels);
  const policies = pkg.customExclusions || [];

  const routePills = places
    .map((p, i) => {
      const pill = `<div class="rpill">${esc(p.placeCover)}${
        p.nights ? `<span>${p.nights}N stay</span>` : ''
      }</div>`;
      const arrow = i < places.length - 1 ? '<span class="rarrow">→</span>' : '';
      return pill + arrow;
    })
    .join('');

  const overview = pkg.packageDescription
    ? `<div class="sec-block"><div class="sec">Package Overview</div>
       <div class="ov-wrap">${formatPackageDescription(pkg.packageDescription)}</div></div>`
    : '';

  const hotelCards = hotels
    .map((h) => {
      const thumb = h.pdfImage
        ? `<div class="hcard-thumb"><img src="${h.pdfImage}" alt=""/></div>`
        : `<div class="hcard-thumb hcard-thumb-icon">🏨</div>`;
      return `
    <div class="hcard">
      <div class="hcard-day"><div class="n">${esc(h.day)}</div><div class="l">Night</div></div>
      <div class="hcard-body">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <div style="flex:1;min-width:0;">
            <div class="hcard-name">${esc(h.propertyName)}</div>
            <div class="hcard-city">${esc(h.cityName)}</div>
            <div class="hcard-grid">
              <span class="hchip">${esc(h.roomName || 'Room')}</span>
              <span class="hchip">${esc(h.mealPlan || '—')} meal</span>
            
            </div>
          </div>
          ${thumb}
        </div>
      </div>
    </div>`;
    })
    .join('');

  const hotelSection = hotels.length
    ? `<div class="sec-block"><div class="sec">Hotel-wise Breakdown</div>${hotelCards}</div>`
    : '';

  const transferSection = transferDetails.length
    ? `<div class="sec-block"><div class="sec">Transfer Details</div>${transferDetails
        .map((d) => {
          const seats =
            d.seatingCapacity ||
            (d.cabSeatingCapacity ? `${d.cabSeatingCapacity} Seater` : '—');
          const chips = [
            d.cabType ? `<span class="tchip">${esc(d.cabType)}</span>` : '',
            seats && seats !== '—' ? `<span class="tchip">${esc(seats)}</span>` : '',
            d.luggage ? `<span class="tchip">${esc(d.luggage)}</span>` : '',
            d.quantity ? `<span class="tchip">Qty ${esc(d.quantity)}</span>` : '',
          ]
            .filter(Boolean)
            .join('');
          return `
        <div class="tcard">
          <div class="tcard-left">
            <div class="tcard-kicker">Private Transfer</div>
            <div class="tn">${esc(d.cabName || d.cabType || 'Vehicle')}</div>
            <div class="tm">Comfortable vehicle for your full journey across destinations</div>
            ${chips ? `<div class="tcard-chips">${chips}</div>` : ''}
          </div>
          <div class="tcard-icon">🚐</div>
        </div>`;
        })
        .join('')}</div>`
    : '';

  const dayCards = itinDays
    .map((dayEntry) => {
      const it = dayEntry.selectedItinerary || {};
      const dayNum = dayEntry.day;
      const hotel = hotelMap.get(Number(dayNum));
      return `
      <div class="tl-day">
        <div class="tl-dot">${esc(dayNum)}</div>
        <div class="tl-card">
          <div class="tl-head">
            <h3>${esc(it.itineraryTitle || `Day ${dayNum}`)}</h3>
            <div class="city">${esc(it.cityName || '')}</div>
          </div>
          <div class="tl-body">
            ${it.itineraryDescription ? `<div class="tl-desc">${p2h(it.itineraryDescription)}</div>` : ''}
            ${hotel ? renderItineraryHotelCard(hotel, lead.travelDate) : ''}
          </div>
        </div>
      </div>`;
    })
    .join('');

  const bankCardsHtml = BANKS.map(
    (b) => `
    <div class="bank-card-item">
      <div class="bci-head">
        <span class="bci-tag">${esc(b.short)}</span>
        <span class="bci-name">${esc(b.bank)}</span>
      </div>
      <div class="bank-grid">
        <div class="bk"><div class="bl">A/C No</div><div class="bv">${esc(b.acc)}</div></div>
        <div class="bk"><div class="bl">A/C Name</div><div class="bv">${esc(b.name)}</div></div>
        <div class="bk"><div class="bl">Account Type</div><div class="bv">${esc(b.type)}</div></div>
        <div class="bk"><div class="bl">IFSC Code</div><div class="bv">${esc(b.ifsc)}</div></div>
      </div>
    </div>`
  ).join('');

  const pricing = `
  <div class="sec-block"><div class="sec">Cost Summary</div>
  <div class="bill">
   <div class="bill-row tot"><span>Grand Total (Included Gst)</span><span>${inr(finalTotal)}</span></div>
  </div></div>`;

  const incExc =
    pkg.packageInclusions || pkg.packageExclusions
      ? `<div class="sec-block"><div class="sec">Inclusions &amp; Exclusions</div>
    <div class="ie">
      <div class="ie-col inc"><div class="ie-h inc">Inclusions</div>${formatContentBlocks(pkg.packageInclusions)}</div>
      <div class="ie-col exc"><div class="ie-h exc">Exclusions</div>${formatContentBlocks(pkg.packageExclusions)}</div>
    </div></div>`
      : '';

  const policiesSection = policies.length
    ? `<div class="sec-block"><div class="sec">Policies &amp; Terms</div>${policies
        .map(
          (p) => `
    <div class="pol">
      <div class="pol-h"><span>■</span> ${esc(p.name)}</div>
      <div class="pol-b">${formatContentBlocks(p.description)}</div>
    </div>`
        )
        .join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(pkg.packageName || 'Travel Quotation')} – ${BRAND}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="top-ribbon"></div>
  <div class="brand-bar">
    <div class="brand-left">
      <img src="${DEMANDSETU_LOGO_URL}" class="brand-logo" alt="Demand Setu Tours"/>
      <div class="brand-name"><strong>${BRAND}</strong><span>${TAGLINE}</span></div>
    </div>
    <div class="brand-contact">
      <b>${PHONE}</b><br/>
      ${EMAIL}<br/>
      ${ADDRESS}
    </div>
  </div>

  <div class="quote-masthead">
    <div class="quote-label">Travel Quotation</div>
    <div class="quote-title">${esc(pkg.packageName || 'Your Journey Package')}</div>
    <div class="quote-meta">
      <b>${esc(pkg.state || '')}</b> · ${esc(pkg.duration || '')} · ${esc(pkg.packageType || 'Custom')}
      · Ref ${esc(ref)}
    </div>
  </div>

  <div class="price-band">
    <div>
      <div class="pb-l">Package investment</div>
      <div class="pb-t">${esc(pkg.pickupLocation || '')} → ${esc(pkg.dropLocation || '')}</div>
    </div>
    <div>
      <div class="pb-l">TOTAL PRICE</div>
      <div class="pb-l">incl. GST</div> 
      <div class="pb-v">${inr(finalTotal)}</div>
      <div class="pb-n">All inclusive</div>
    </div>
  </div>

  <div class="facts">
    <div class="fact"><div class="fl">Guest</div><div class="fv">${esc(lead.name || '—')}</div></div>
    <div class="fact"><div class="fl">Mobile</div><div class="fv">${esc(lead.mobile || '—')}</div></div>
    <div class="fact"><div class="fl">Email</div><div class="fv">${esc(lead.email || '—')}</div></div>
    <div class="fact"><div class="fl">Travel date</div><div class="fv">${fmtDate(lead.travelDate)}</div></div>
    <div class="fact"><div class="fl">Duration</div><div class="fv">${esc(pkg.duration || `${lead.days || ''}D`)}</div></div>
    <div class="fact"><div class="fl">Rooms</div><div class="fv">${esc(lead.noOfRooms || '1')}</div></div>
  </div>

  <div class="hello">
    Dear <strong>${esc(lead.name || 'Guest')}</strong>, thank you for choosing <strong>${BRAND}</strong>.
    This quotation is your bridge to an unforgettable ${esc(pkg.state || 'Himachal')} experience —
    curated stays, seamless transfers, and day-by-day planning. Review the details below and reach out anytime for tweaks.
  </div>

  ${
    places.length
      ? `<div class="route-box"><div class="route-h">Journey route</div><div class="route-pills">${routePills}</div></div>`
      : ''
  }

  ${overview}
  ${hotelSection}
  ${transferSection}

  <div class="sec-block"><div class="sec">Day-wise Itinerary &amp; Stays</div>
  <div class="tl">${dayCards}</div></div>

  ${pricing}
  ${incExc}
  ${policiesSection}

  <div class="sec-block"><div class="sec">Payment Details</div>
  <div class="bank">
    <div class="bank-banner">
      <div class="bb-t">Bank Details</div>
      <div class="bb-s">Secure payment information for your booking</div>
    </div>
    <div class="bank-body">${bankCardsHtml}</div>
  </div></div>

  <div class="foot">
    <div class="fn">${BRAND}</div>
    <div class="fc">${PHONE} · ${EMAIL}</div>
    <div class="fc" style="font-size:8px;opacity:.7">${ADDRESS}</div>
    <div class="fl">
      Quote Ref: ${esc(ref)} · Generated: ${esc(generated)}<br/>
      Computer-generated quotation. Rates subject to availability at confirmation.
      Itinerary may change for weather or road conditions; equivalent alternatives will be arranged.
    </div>
  </div>
</body>
</html>`;
}
