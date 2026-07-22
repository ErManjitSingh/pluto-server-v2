// ─── Demand Setu Tours – Orange PDF Template (distinct from PTW) ─────────────

import {
  esc,
  inr,
  fmtDate,
  p2h,
  formatOverviewBlocks,
  formatListBlocks,
  icons,
} from './finalcostingPdfShared.js';

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

function ico(name, color = '#ffffff', size = 14) {
  const fn = icons[name];
  return fn ? fn(color, size) : '';
}

function formatPackageDescription(html) {
  return formatOverviewBlocks(html, { numbered: true });
}

function formatContentBlocks(html) {
  return formatListBlocks(html, { numbered: true });
}

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
    : `<div class="stay-logo-box stay-icon-fallback">${ico('hotel', '#ffffff', 28)}</div>`;
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
:root{--orange:#ea580c;--orange-deep:#c2410c;--ink:#1a1a1a;--muted:#6b7280;--dark:#111827;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:Georgia,'Times New Roman',serif;font-size:13.5px;line-height:1.65;color:var(--ink);background:#fed7aa;}
svg{display:inline-block;vertical-align:middle;flex-shrink:0;}
.sans{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
.page-shell{background:linear-gradient(180deg,#ffedd5 0%,#fff7ed 50%,#fff4eb 100%);border:2px solid #fb923c;border-radius:14px;padding:12px;}
.top-ribbon{height:8px;background:linear-gradient(90deg,#9a3412,#ea580c,#fb923c,#f97316);border-radius:8px 8px 0 0;margin:-12px -12px 0;}
.brand-bar{display:flex;justify-content:space-between;align-items:center;padding:12px;margin:0 -12px 10px;background:linear-gradient(90deg,#7c2d12 0%,#c2410c 40%,#ea580c 100%);color:#fff;border-bottom:3px solid #fdba74;}
.brand-left{display:flex;align-items:center;gap:12px;}
.brand-logo{height:52px;width:auto;max-width:190px;object-fit:contain;display:block;background:#111;border-radius:6px;padding:4px 8px;}
.brand-name{font-family:'Segoe UI',Arial,sans-serif;}
.brand-name strong{display:block;font-size:18px;color:#fff7ed;}
.brand-name span{display:block;font-size:11px;color:#fdba74;letter-spacing:.12em;margin-top:2px;}
.brand-contact{text-align:right;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#ffedd5;line-height:1.65;max-width:250px;}
.brand-contact b{color:#fff;font-size:12.5px;}
.quote-masthead{margin-bottom:10px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,#fff 0%,#ffedd5 100%);border:1px solid #fb923c;border-left:5px solid #ea580c;}
.quote-label{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#c2410c;margin-bottom:4px;}
.quote-title{font-size:26px;font-weight:700;line-height:1.2;color:var(--dark);margin-bottom:6px;}
.quote-meta{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:var(--muted);}
.quote-meta b{color:var(--dark);}
.price-band{background:linear-gradient(90deg,#9a3412 0%,#c2410c 35%,#ea580c 70%,#f97316 100%);color:#fff;border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;font-family:'Segoe UI',Arial,sans-serif;border:1px solid #7c2d12;}
.price-band .pb-l{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.95;}
.price-band .pb-t{font-size:14px;margin-top:3px;}
.price-band .pb-v{font-size:28px;font-weight:800;}
.price-band .pb-n{font-size:11px;opacity:.9;text-align:right;margin-top:2px;}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-family:'Segoe UI',Arial,sans-serif;}
.fact{width:calc(33.33% - 6px);background:linear-gradient(180deg,#fff,#ffedd5);border:1px solid #fb923c;border-top:3px solid #ea580c;border-radius:8px;padding:10px 11px;}
.fact:nth-child(even){background:linear-gradient(180deg,#fff7ed,#fed7aa);border-top-color:#c2410c;}
.fact .fl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c2410c;}
.fact .fv{font-size:13.5px;font-weight:700;color:var(--dark);margin-top:3px;}
.hello{font-size:13.5px;line-height:1.7;color:#374151;margin-bottom:10px;padding:12px;border-radius:10px;background:linear-gradient(135deg,#fff7ed,#ffedd5 60%,#fed7aa);border:1px solid #fb923c;border-left:5px solid #ea580c;}
.hello strong{color:#c2410c;}
.route-box{margin-bottom:10px;font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#9a3412,#ea580c);border-radius:12px;padding:12px;border:1px solid #7c2d12;}
.route-h{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ffedd5;margin-bottom:8px;}
.route-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.rpill{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:8px;padding:7px 11px;font-size:12.5px;font-weight:700;}
.rpill span{display:block;font-size:10.5px;font-weight:500;opacity:.9;margin-top:1px;}
.rarrow{color:#ffedd5;font-size:14px;font-weight:700;}
.sec-block{margin-bottom:8px;}
.sec{font-family:'Segoe UI',Arial,sans-serif;font-size:15.5px;font-weight:800;color:#fff;margin:0;padding:10px 12px;display:block;width:100%;box-sizing:border-box;background:linear-gradient(90deg,#9a3412,#ea580c 60%,#f97316);border-radius:10px 10px 0 0;border:1px solid #7c2d12;border-bottom:none;}
.ov-wrap{background:linear-gradient(180deg,#fed7aa,#ffedd5);border:1px solid #fb923c;border-top:none;border-radius:0 0 12px 12px;padding:10px;}
.ov-item{display:flex;gap:10px;align-items:flex-start;background:linear-gradient(90deg,#fff,#fff7ed);border:1px solid #fdba74;border-left:4px solid #ea580c;border-radius:8px;padding:10px 12px;margin-bottom:7px;page-break-inside:avoid;}
.ov-item:last-child{margin-bottom:0;}
.ov-num{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:800;color:#ea580c;min-width:24px;}
.ov-text{font-family:'Segoe UI',Arial,sans-serif;font-size:13.5px;font-weight:600;color:var(--dark);line-height:1.55;}
.hcard{display:flex;border:1px solid #fb923c;border-radius:10px;overflow:hidden;margin-bottom:8px;background:linear-gradient(90deg,#fff,#ffedd5);page-break-inside:avoid;font-family:'Segoe UI',Arial,sans-serif;}
.hcard-day{width:56px;background:linear-gradient(180deg,#c2410c,#ea580c);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 4px;}
.hcard-day .n{font-size:20px;font-weight:800;line-height:1;}
.hcard-day .l{font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-top:3px;}
.hcard-body{flex:1;padding:10px 12px;}
.hcard-thumb{width:90px;height:70px;flex-shrink:0;border-radius:10px;overflow:hidden;border:2px solid #fb923c;background:#ffedd5;margin-left:auto;}
.hcard-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.hcard-thumb-icon{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ea580c,#f97316);color:#fff;}
.hcard-name{font-size:14.5px;font-weight:800;color:var(--dark);}
.hcard-city{font-size:12.5px;color:var(--muted);margin:2px 0 8px;}
.hcard-grid{display:flex;gap:6px;flex-wrap:wrap;}
.hchip{background:#fff7ed;border:1px solid #fdba74;border-radius:6px;padding:5px 9px;font-size:12px;font-weight:600;color:#c2410c;}
.tcard{position:relative;overflow:hidden;background:linear-gradient(120deg,#9a3412 0%,#c2410c 35%,#ea580c 70%,#f97316 100%);color:#fff;border-radius:14px;padding:18px 16px;margin-bottom:8px;font-family:'Segoe UI',Arial,sans-serif;display:flex;justify-content:space-between;align-items:center;gap:14px;page-break-inside:avoid;border:1px solid #7c2d12;}
.tcard-left{position:relative;z-index:1;flex:1;min-width:0;}
.tcard-kicker{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:4px 10px;margin-bottom:8px;}
.tcard .tn{font-size:20px;font-weight:800;line-height:1.2;}
.tcard .tm{font-size:13.5px;opacity:.95;margin-top:6px;line-height:1.45;}
.tcard-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.tchip{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;}
.tcard-icon{position:relative;z-index:1;flex-shrink:0;width:68px;height:68px;border-radius:16px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;}
.tl{position:relative;padding:10px 10px 10px 32px;margin:0;background:linear-gradient(180deg,#ffedd5,#fff7ed);border:1px solid #fb923c;border-top:none;border-radius:0 0 12px 12px;}
.tl::before{content:'';position:absolute;left:14px;top:12px;bottom:12px;width:3px;background:linear-gradient(180deg,#ea580c,#fdba74);border-radius:2px;}
.tl-day{position:relative;margin-bottom:12px;page-break-inside:avoid;}
.tl-dot{position:absolute;left:-28px;top:6px;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#c2410c,#ea580c);color:#fff;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 0 2px #ea580c;}
.tl-card{border:1px solid #fb923c;border-radius:10px;overflow:hidden;background:#fff;}
.tl-head{background:linear-gradient(90deg,#c2410c,#ea580c);padding:9px 12px;font-family:'Segoe UI',Arial,sans-serif;color:#fff;}
.tl-head h3{font-size:15px;font-weight:800;color:#fff;}
.tl-head .city{font-size:11.5px;color:#ffedd5;letter-spacing:.06em;text-transform:uppercase;margin-top:2px;}
.tl-body{padding:10px;background:linear-gradient(180deg,#fff7ed,#ffedd5);}
.tl-desc{font-size:13.5px;line-height:1.7;color:#374151;margin-bottom:8px;}
.stay-card{display:flex;justify-content:space-between;align-items:stretch;gap:12px;background:linear-gradient(90deg,#fff,#ffedd5);border:1px solid #fb923c;border-radius:10px;padding:11px 12px;margin-top:4px;page-break-inside:avoid;font-family:'Segoe UI',Arial,sans-serif;}
.stay-left{flex:1;min-width:0;}
.stay-top{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;}
.stay-badge{display:inline-block;background:#c2410c;color:#fff;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;}
.stay-at{font-size:12px;color:#6b7280;}
.stay-at b{color:#111827;font-weight:800;}
.stay-checkin{font-size:11px;color:#9ca3af;margin-bottom:6px;}
.stay-name{font-size:15px;font-weight:800;color:#c2410c;margin-bottom:8px;line-height:1.25;}
.stay-meta{display:flex;gap:24px;}
.stay-meta-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;font-weight:700;}
.stay-meta-val{font-size:13px;font-weight:800;color:#111827;margin-top:2px;}
.stay-logo-box{width:72px;height:72px;flex-shrink:0;border-radius:10px;border:2px solid #fb923c;background:#ffedd5;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.stay-photo{width:100%;height:100%;object-fit:cover;display:block;}
.stay-icon-fallback{background:linear-gradient(135deg,#ea580c,#f97316);color:#fff;}
.bill{border:1px solid #fb923c;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;}
.bill-row{display:flex;justify-content:space-between;padding:11px 12px;border-bottom:1px solid #fdba74;font-size:13.5px;background:#ffedd5;}
.bill-row:last-child{border-bottom:none;}
.bill-row.tot{background:linear-gradient(90deg,#c2410c,#ea580c);color:#fff;font-size:16px;font-weight:800;}
.ie{display:flex;gap:8px;padding:10px;background:linear-gradient(180deg,#ffedd5,#fff7ed);border:1px solid #fb923c;border-top:none;border-radius:0 0 12px 12px;font-family:'Segoe UI',Arial,sans-serif;}
.ie-col{flex:1;border-radius:8px;padding:10px;}
.ie-col.inc{background:linear-gradient(165deg,#bbf7d0,#ecfdf3);border:1px solid #86efac;border-left:4px solid #16a34a;}
.ie-col.exc{background:linear-gradient(165deg,#fecaca,#fef2f2);border:1px solid #fca5a5;border-left:4px solid #dc2626;}
.ie-h{font-size:13.5px;font-weight:800;margin-bottom:8px;letter-spacing:.06em;text-transform:uppercase;padding-bottom:5px;border-bottom:2px solid rgba(0,0,0,.08);}
.ie-h.inc{color:#16a34a;}
.ie-h.exc{color:#dc2626;}
.pol{background:linear-gradient(180deg,#ffedd5,#fff7ed);border:1px solid #fb923c;border-radius:10px;margin-bottom:8px;overflow:hidden;}
.pol-h{background:linear-gradient(90deg,#c2410c,#ea580c);color:#fff;padding:10px 12px;font-family:'Segoe UI',Arial,sans-serif;font-size:13.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}
.pol-h span{color:#ffedd5;}
.pol-b{padding:8px 10px;}
.bank{border:1px solid #fb923c;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;}
.bank-banner{background:linear-gradient(90deg,#9a3412,#ea580c);color:#fff;padding:10px 12px;}
.bank-banner .bb-t{font-size:14.5px;font-weight:800;}
.bank-banner .bb-s{font-size:11.5px;opacity:.9;margin-top:2px;}
.bank-body{padding:10px;background:linear-gradient(180deg,#ffedd5,#fff7ed);display:flex;flex-direction:column;gap:8px;}
.bank-card-item{background:linear-gradient(90deg,#fff,#fff7ed);border:1px solid #fdba74;border-left:4px solid #ea580c;border-radius:8px;padding:10px;page-break-inside:avoid;}
.bank-card-item .bci-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.bank-card-item .bci-tag{background:#ea580c;color:#fff;font-size:10px;font-weight:800;letter-spacing:.06em;padding:4px 8px;border-radius:4px;}
.bank-card-item .bci-name{font-size:13.5px;font-weight:800;color:var(--dark);}
.bank-grid{display:flex;flex-wrap:wrap;gap:8px;}
.bk{width:calc(50% - 4px);background:#ffedd5;border-radius:6px;padding:7px 9px;border:1px solid #fdba74;}
.bk .bl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;}
.bk .bv{font-size:13px;font-weight:700;color:var(--dark);margin-top:2px;}
.foot{margin-top:12px;padding:14px;text-align:center;background:linear-gradient(135deg,#9a3412,#c2410c 40%,#ea580c);color:#fff;border-radius:12px;font-family:'Segoe UI',Arial,sans-serif;border:1px solid #7c2d12;}
.foot .fn{font-size:15.5px;font-weight:800;color:#ffedd5;margin-bottom:4px;}
.foot .fc{font-size:12px;opacity:.95;margin-bottom:4px;}
.foot .fl{font-size:11px;opacity:.85;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.25);line-height:1.55;}
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
        : `<div class="hcard-thumb hcard-thumb-icon">${ico('hotel', '#ffffff', 30)}</div>`;
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
    ? `<div class="sec-block"><div class="sec">Hotel-wise Breakdown</div><div class="ov-wrap">${hotelCards}</div></div>`
    : '';

  const transferSection = transferDetails.length
    ? `<div class="sec-block"><div class="sec">Transfer Details</div><div class="ov-wrap">${transferDetails
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
          <div class="tcard-icon">${ico('cab', '#ffffff', 34)}</div>
        </div>`;
        })
        .join('')}</div></div>`
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
  <div class="page-shell">
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
  </div>
</body>
</html>`;
}
