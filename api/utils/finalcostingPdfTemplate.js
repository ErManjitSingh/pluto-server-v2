// ─── PTW Holidays – PDF Template ────────────────────────────────────────────

import {
  esc,
  inr,
  fmtDate,
  p2h,
  itinDesc,
  formatOverviewBlocks,
  formatQuillContent,
  icons,
  resolveDisplayTotal,
  renderCityAreaHtml,
  renderSimilarHotelsHtml,
  renderPriceAmountHtml,
  renderGrandTotalRows,
  renderStateGalleryHtml,
  renderMakerCardHtml,
} from './finalcostingPdfShared.js';
import { renderSocialIconsHtml } from './finalcostingPdfSocial.js';

const LOGO_URL  = 'https://ptwholidays.in/_next/image?url=%2FPTW-Holidays-logo.png&w=256&q=75';
const BRAND     = 'PTW Holidays Pvt. Ltd.';
const TAGLINE   = 'WORLD TOURS DMC';
const PHONE     = '+91-9317258401';
const EMAIL     = 'info@ptwholidays.com';
const ADDRESS   = 'Dari, Dharamshala, Gabli Dar, Himachal Pradesh 176215';

const BANK = {
  bank:   'STATE BANK OF INDIA',
  acc:    '38207849663',
  name:   'PT HOLIDAYS PVT. LTD.',
  branch: 'PANTHAGHATI-SHIMLA',
  ifsc:   'SBIN0021763',
};

function formatPackageDescription(html) {
  return formatOverviewBlocks(html, { numbered: false });
}

function formatContentBlocks(html) {
  return formatQuillContent(html, { numbered: false });
}

function ico(name, color = '#ffffff', size = 14) {
  const fn = icons[name];
  return fn ? fn(color, size) : '';
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
  const thumb = `<div class="hotel-badge">${ico('hotel', '#ffffff', 26)}</div>`;

  if (forBreakdown) {
    return `
    <div class="hotel-row hotel-row-breakdown">
      <div class="hotel-details">
        <div class="hotel-name">${esc(hotel.propertyName)}</div>
        <div class="hotel-meta">Day ${esc(hotel.day)} · ${esc(hotel.cityName)}</div>
        <div class="hotel-tags">
          <span class="htag">${ico('bed', '#1a5fa8', 11)}${esc(hotel.roomName)}</span>
          <span class="htag">${ico('meal', '#1a5fa8', 11)}${esc(hotel.mealPlan || '—')}</span>
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
          <span class="htag">${ico('bed', '#1a5fa8', 11)}${esc(hotel.roomName)}</span>
          <span class="htag">${ico('meal', '#1a5fa8', 11)}${esc(hotel.mealPlan || '—')}</span>
          <span class="htag">${ico('door', '#1a5fa8', 11)}${esc(hotel.roomcount || '1')} Room</span>
        </div>
      </div>
    </div>`;
}

function renderTransferCard(detail) {
  if (!detail) return '';
  const seats =
    detail.seatingCapacity ||
    (detail.cabSeatingCapacity ? `${detail.cabSeatingCapacity} Seater` : '—');
  return `
    <div class="transfer-row">
      <div class="transfer-badge">${ico('cab', '#ffffff', 28)}</div>
      <div class="hotel-details">
        <div class="hotel-name">${esc(detail.cabName || detail.cabType || 'Transfer Vehicle')}</div>
        <div class="hotel-meta">${esc(detail.cabType || 'Cab')} · Full tour transfer</div>
        <div class="hotel-tags">
          <span class="htag">${esc(seats)}</span>
          ${detail.luggage ? `<span class="htag">${esc(detail.luggage)}</span>` : ''}
          ${detail.quantity ? `<span class="htag">Qty ${esc(detail.quantity)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const CSS = `
:root { --navy:#0b2748; --blue:#1a5fa8; --gold:#c97a1a; --ink:#1c2532; --muted:#4a5d73; --red:#b91c1c; --green:#15803d; }
*{box-sizing:border-box;margin:0;padding:0;}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.65;color:var(--ink);background:#c5daf0;}
a{color:inherit;text-decoration:none;}
svg{display:inline-block;vertical-align:middle;flex-shrink:0;}
.page-shell{background:linear-gradient(180deg,#e3effb 0%,#eef5fc 45%,#f4f9ff 100%);border:2px solid #7aa8d4;border-radius:14px;padding:12px;}
.pg-header{background:linear-gradient(135deg,#071c36 0%,#123660 55%,#1a5fa8 100%);color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-radius:12px;border:1px solid #0a2a4f;}
.pg-header-left{display:flex;align-items:center;gap:10px;}
.pg-logo{height:52px;width:auto;max-width:180px;background:#fff;border-radius:6px;padding:4px 6px;object-fit:contain;display:block;}
.pg-brand strong{font-size:16px;}
.pg-brand span{display:block;font-size:11px;color:#c5daf3;letter-spacing:.12em;}
.pg-header-right{text-align:right;font-size:11px;color:#dbeafe;line-height:1.6;}
.cover-hero{background:linear-gradient(135deg,#071c36 0%,#134878 45%,#1a6bb8 100%);color:#fff;border-radius:12px;padding:20px 18px 16px;margin-bottom:10px;position:relative;overflow:hidden;border:1px solid #0d3a6b;}
.cover-hero::after{content:'';position:absolute;right:-30px;top:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.08);}
.cover-tag{display:inline-block;background:linear-gradient(90deg,#c97a1a,#e0a04a);color:#fff;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:5px 12px;border-radius:4px;margin-bottom:10px;position:relative;z-index:1;}
.cover-title{font-size:26px;font-weight:800;line-height:1.15;margin-bottom:6px;position:relative;z-index:1;max-width:68%;}
.cover-sub{font-size:13.5px;color:#cfe0f5;margin-bottom:12px;position:relative;z-index:1;}
.cover-chips{display:flex;flex-wrap:wrap;gap:7px;position:relative;z-index:1;max-width:68%;}
.chip{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);padding:6px 11px;border-radius:8px;font-size:12.5px;display:inline-flex;align-items:center;gap:4px;}
.chip b{color:#ffd89a;}
.price-badge{position:absolute;right:14px;top:16px;z-index:2;background:linear-gradient(180deg,#fff,#fff8ec);color:var(--navy);border-radius:12px;padding:12px 14px;text-align:center;min-width:128px;border:2px solid #e0a04a;}
.price-badge .pl{font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--muted);}
.price-badge .pv{font-size:24px;font-weight:800;color:var(--gold);margin:4px 0;}
.price-badge .pn{font-size:10px;color:var(--muted);}
.guest-strip{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}
.gs-cell{width:calc(33.33% - 6px);padding:10px 11px;border-radius:10px;background:linear-gradient(180deg,#fff,#dceaf8);border:1px solid #8fb4d9;border-top:3px solid var(--blue);box-sizing:border-box;}
.gs-cell:nth-child(even){background:linear-gradient(180deg,#fffbf3,#ffe9c8);border-color:#e0a04a;border-top-color:var(--gold);}
.gs-lbl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.gs-val{font-size:13.5px;font-weight:700;margin-top:3px;color:var(--navy);}
.route-wrap{background:linear-gradient(135deg,#0e3564,#1a5fa8);border:1px solid #0a2f5c;border-radius:12px;padding:12px 14px;margin-bottom:10px;color:#fff;}
.route-lbl{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ffd89a;margin-bottom:8px;}
.route-steps{display:flex;flex-wrap:wrap;align-items:flex-start;}
.rs{text-align:center;padding:0 6px;min-width:58px;}
.rs-dot{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#c97a1a,#e0a04a);color:#fff;font-size:12px;font-weight:800;line-height:30px;margin:0 auto 5px;border:2px solid #fff;}
.rs-name{font-size:12.5px;font-weight:700;color:#fff;}
.rs-nights{font-size:11px;color:#b8d4f0;margin-top:1px;}
.rs-arr{color:#7eb0e0;font-size:16px;margin-top:10px;padding:0 2px;}
.sec-head{display:flex;align-items:center;gap:9px;padding:11px 12px;background:linear-gradient(90deg,#0b2748 0%,#1a5fa8 70%,#2a7bc8 100%);color:#fff;border-radius:10px 10px 0 0;margin:12px 0 0;border:1px solid #0a2a4f;border-bottom:none;}
.sec-head .ico{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.sec-head h2{font-size:15.5px;font-weight:700;}
.sec-head .sub{font-size:11.5px;color:#c5daf3;margin-top:1px;}
.sec-panel{background:linear-gradient(180deg,#d6e8fb,#eef5fc);border:1px solid #7aa8d4;border-top:none;border-radius:0 0 12px 12px;padding:10px;margin-bottom:2px;}
.day-card{border:1px solid #7aa8d4;border-radius:12px;margin-bottom:10px;overflow:hidden;page-break-inside:avoid;background:#fff;}
.day-header{display:flex;background:linear-gradient(135deg,#0b2748,#1a5fa8);color:#fff;}
.day-num{min-width:56px;padding:10px 8px;text-align:center;background:linear-gradient(180deg,#c97a1a,#a86212);display:flex;flex-direction:column;align-items:center;justify-content:center;}
.day-num .dn{font-size:22px;font-weight:800;line-height:1;}
.day-num .dl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin-top:2px;}
.day-info{flex:1;padding:10px 12px;}
.day-info h3{font-size:15.5px;font-weight:700;margin-bottom:2px;}
.day-info .city-tag{font-size:11.5px;color:#c5daf3;letter-spacing:.06em;}
.day-body{padding:10px;background:linear-gradient(180deg,#e8f2fc,#d6e8fb);}
.day-desc{font-size:13.5px;color:#243447;line-height:1.7;margin-bottom:8px;}
.day-summary{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}
.day-pill{background:linear-gradient(180deg,#fff,#cfe4f7);border:1px solid #7aa8d4;color:#0e3d6e;border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:700;}
.hotel-row{display:flex;gap:10px;align-items:flex-start;background:linear-gradient(135deg,#fff,#cfe4f7);border:1px solid #7aa8d4;border-radius:10px;padding:10px;}
.hotel-badge{width:52px;height:52px;flex-shrink:0;border-radius:12px;background:linear-gradient(135deg,#0b2748,#1a5fa8);display:flex;align-items:center;justify-content:center;}
.hotel-thumb{width:78px;height:60px;flex-shrink:0;border-radius:10px;overflow:hidden;border:2px solid #7aa8d4;background:#b8d4f0;}
.hotel-thumb-lg{width:100px;height:76px;}
.hotel-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.hotel-row-breakdown{align-items:center;}
.hotel-row-breakdown .hotel-details{flex:1;}
.hotel-details{flex:1;}
.hotel-name{font-size:14.5px;font-weight:800;color:var(--navy);}
.hotel-meta{font-size:12.5px;color:var(--muted);margin:2px 0 5px;}
.hotel-tags{display:flex;gap:5px;flex-wrap:wrap;}
.htag{background:linear-gradient(180deg,#fff,#e8f2fc);border:1px solid #9fc0e4;padding:4px 9px;border-radius:8px;font-size:12px;font-weight:600;color:var(--navy);display:inline-flex;align-items:center;gap:2px;}
.transfer-row{display:flex;gap:12px;align-items:center;background:linear-gradient(135deg,#0e3564,#1a5fa8);border:1px solid #0a2f5c;border-radius:12px;padding:12px;margin-bottom:8px;page-break-inside:avoid;color:#fff;}
.transfer-badge{width:50px;height:50px;flex-shrink:0;border-radius:14px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;}
.transfer-row .hotel-name{color:#fff;}
.transfer-row .hotel-meta{color:#b8d4f0;}
.transfer-row .htag{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:#fff;}
.pkg-desc-wrap{margin:10px 0;border-radius:12px;border:1px solid #7aa8d4;background:linear-gradient(165deg,#b8d4f0,#e8f2fc 50%,#f0f7ff);overflow:hidden;}
.pkg-desc-title{font-size:14.5px;font-weight:800;color:#fff;letter-spacing:.06em;text-transform:uppercase;padding:10px 12px;background:linear-gradient(90deg,#0b2748,#1a5fa8);}
.pkg-desc-items{display:flex;flex-direction:column;gap:7px;padding:10px;}
.pkg-desc-item{background:linear-gradient(90deg,#fff8ec,#fff);border:1px solid #d4b07a;border-left:5px solid var(--gold);border-radius:8px;padding:10px 12px;page-break-inside:avoid;}
.pkg-desc-item-text{font-size:13.5px;font-weight:600;color:#1a3d66;line-height:1.55;}
.stack-block{margin-bottom:8px;}
.bill-card{border:1px solid #7aa8d4;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;}
.bill-row{display:flex;justify-content:space-between;padding:11px 12px;font-size:13.5px;background:#dceaf8;}
.bill-row.total{background:linear-gradient(90deg,#0b2748,#1a5fa8);color:#fff;font-size:16px;font-weight:800;}
.bill-row.total span:last-child{color:#ffd89a;}
.ie-grid{display:flex;gap:8px;}
.ie-col{flex:1;border-radius:10px;padding:10px;page-break-inside:auto;}
.ie-col.inc{background:linear-gradient(165deg,#a7f3d0,#ecfdf3 55%,#fff);border:1px solid #6ee7b7;border-left:5px solid var(--green);}
.ie-col.exc{background:linear-gradient(165deg,#fecaca,#fef2f2 55%,#fff);border:1px solid #fca5a5;border-left:5px solid var(--red);}
.ie-head{font-size:13.5px;font-weight:800;margin-bottom:8px;letter-spacing:.06em;text-transform:uppercase;padding-bottom:5px;border-bottom:2px solid rgba(0,0,0,.08);}
.ie-head.inc{color:var(--green);}
.ie-head.exc{color:var(--red);}
.ie-col .pkg-desc-items{padding:0;}
.ie-col.inc .pkg-desc-item{border-left-color:var(--green);border-color:#86efac;background:#fff;}
.ie-col.exc .pkg-desc-item{border-left-color:var(--red);border-color:#fca5a5;background:#fff;}
.policy{border:1px solid #7aa8d4;border-radius:12px;margin-bottom:8px;overflow:hidden;page-break-inside:auto;background:linear-gradient(180deg,#d6e8fb,#eef5fc);}
.policy-head{background:linear-gradient(90deg,#0b2748,#1a5fa8);color:#fff;padding:10px 12px;font-size:13.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}
.policy-body{padding:8px 10px;}
.policy-body .pkg-desc-items{padding:0;}
.bank-card{border:1px solid #7aa8d4;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;}
.bank-banner{background:linear-gradient(90deg,#0b2748,#1a5fa8);color:#fff;padding:10px 12px;}
.bank-banner .bb-t{font-size:14.5px;font-weight:800;}
.bank-banner .bb-s{font-size:11.5px;color:#c5daf3;margin-top:2px;}
.bank-body{padding:10px;background:linear-gradient(165deg,#b8d4f0,#e8f2fc 50%,#fff);}
.bank-single{background:linear-gradient(90deg,#fff8ec,#fff);border:1px solid #e0a04a;border-left:5px solid var(--gold);border-radius:10px;padding:10px 12px;}
.bank-single .bank-name{font-size:14.5px;font-weight:800;color:var(--navy);margin-bottom:8px;}
.bank-grid{display:flex;gap:8px;flex-wrap:wrap;}
.bk{width:calc(50% - 4px);background:#dceaf8;border-radius:8px;padding:8px 10px;border:1px solid #9fc0e4;}
.bk .bl{font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
.bk .bv{font-size:13.5px;font-weight:700;color:var(--navy);margin-top:2px;}
.doc-footer{background:linear-gradient(135deg,#071c36,#134878);color:#fff;border-radius:12px;padding:14px 16px;text-align:center;margin-top:12px;border:1px solid #0a2a4f;}
.doc-footer .fn{font-size:15.5px;font-weight:800;margin-bottom:4px;color:#ffd89a;}
.doc-footer .fc{font-size:12px;color:#c5daf3;margin-bottom:6px;}
.doc-footer .fl{font-size:11px;color:#b8d4f0;line-height:1.55;border-top:1px solid rgba(255,255,255,.2);padding-top:8px;margin-top:6px;}
.social-row{display:flex;justify-content:center;align-items:center;gap:14px;margin:10px 0 4px;}
.social-ico{display:inline-flex;width:28px;height:28px;border-radius:50%;overflow:hidden;}
.social-ico img{width:28px;height:28px;display:block;border:0;}
.maker-card{margin:12px 0 8px;padding:12px 14px;border-radius:12px;border:1px solid #7aa8d4;border-left:5px solid var(--gold);background:linear-gradient(135deg,#fff8ec,#e8f2fc);page-break-inside:avoid;}
.maker-kicker{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}
.maker-name{font-size:16px;font-weight:800;color:var(--navy);}
.maker-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;font-size:12px;color:var(--muted);font-weight:600;}
.maker-contact{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:13px;font-weight:700;color:var(--blue);}
.greeting{background:linear-gradient(135deg,#fff8ec 0%,#ffe9c8 45%,#dceaf8 100%);border:1px solid #e0a04a;border-left:5px solid var(--gold);border-radius:10px;padding:12px;margin-bottom:10px;font-size:13.5px;line-height:1.7;color:#2c3e50;}
.greeting strong{color:var(--navy);}
.state-gallery{display:flex;gap:10px;margin:0 0 12px;page-break-inside:avoid;}
.sg-cell{flex:1;min-width:0;height:140px;border-radius:12px;overflow:hidden;border:2px solid #7aa8d4;background:#c5daf0;box-shadow:0 2px 8px rgba(11,39,72,.12);}
.sg-cell img{width:100%;height:100%;object-fit:cover;display:block;}
.itin-lines{margin:0 0 8px 0;padding-left:0;list-style:none;}
.itin-lines li{position:relative;padding:5px 8px 5px 22px;font-size:13.5px;line-height:1.6;color:#243447;border-bottom:1px dashed #c5daf0;}
.itin-lines li:last-child{border-bottom:none;}
.itin-lines li::before{content:'›';position:absolute;left:6px;top:5px;color:var(--blue);font-weight:700;font-size:15px;}
.ca-block{margin-top:8px;border:1px solid #7aa8d4;border-radius:10px;overflow:hidden;background:#fff;}
.ca-title,.sh-title{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:7px 10px;background:linear-gradient(90deg,#0b2748,#1a5fa8);color:#fff;}
.ca-list,.sh-list{padding:8px;}
.ca-item{padding:7px 8px;margin-bottom:6px;border-left:4px solid var(--gold);background:linear-gradient(90deg,#fff8ec,#fff);border-radius:6px;border:1px solid #e0a04a;}
.ca-item:last-child{margin-bottom:0;}
.ca-name{font-size:13px;font-weight:800;color:var(--navy);}
.ca-desc{font-size:12px;color:#334155;line-height:1.5;margin-top:3px;}
.sh-block{margin-top:8px;border:1px solid #7aa8d4;border-radius:10px;overflow:hidden;background:#fff;}
.sh-item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;margin-bottom:5px;background:linear-gradient(180deg,#fff,#e8f2fc);border:1px solid #9fc0e4;border-radius:8px;}
.sh-item:last-child{margin-bottom:0;}
.sh-name{font-size:13px;font-weight:700;color:var(--navy);}
.sh-rating{font-size:12px;font-weight:800;color:var(--gold);white-space:nowrap;}
.price-was{font-size:12px;color:var(--muted);text-decoration:line-through;margin-bottom:2px;}
.bill-row:not(.total){background:#eef5fc;border-bottom:1px solid #c5daf0;color:var(--ink);}
.quill-pdf{font-size:13.5px;line-height:1.65;color:#243447;}
.quill-pdf p{margin:0 0 6px;}
.quill-pdf ol,.quill-pdf ul{margin:0 0 6px;padding-left:18px;}
.quill-pdf li{margin:0 0 4px;}
.quill-pdf strong,.quill-pdf b{font-weight:800;}
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
  const pricingInfo = resolveDisplayTotal(operation);
  const { displayTotal, finalTotal } = pricingInfo;
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
      ${renderPriceAmountHtml(pricingInfo, { valueClass: 'pv', noteClass: 'pn' })}
    </div>
    ${(pkg.tags || []).includes('trending') ? '<span class="cover-tag">Trending</span>' : '<span class="cover-tag">Custom Package</span>'}
    <div class="cover-title">${esc(pkg.packageName || 'Your Himachal Package')}</div>
    <div class="cover-sub">${esc(pkg.state || '')} · ${esc(pkg.duration || '')} · ${esc(pkg.packageType || 'Custom')}</div>
    <div class="cover-chips">
      ${pkg.pickupLocation ? `<span class="chip">${ico('pin', '#f0d090', 12)} Pickup: <b>${esc(pkg.pickupLocation)}</b></span>` : ''}
      ${pkg.dropLocation   ? `<span class="chip">${ico('flag', '#f0d090', 12)} Drop: <b>${esc(pkg.dropLocation)}</b></span>`   : ''}
      ${lead.travelDate    ? `<span class="chip">${ico('calendar', '#f0d090', 12)} Travel: <b>${fmtDate(lead.travelDate)}</b></span>` : ''}
      <span class="chip">${ico('cab', '#f0d090', 14)} <b>${esc(cabName)}</b></span>
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
    <div class="gs-cell"><div class="gs-lbl">Extra Beds</div><div class="gs-val">${esc(lead.extraBeds != null && lead.extraBeds !== '' ? lead.extraBeds : '0')}</div></div>
  </div>`;

  // ── Greeting ─────────────────────────────────────────────────────────────
  const stateGallery = renderStateGalleryHtml(operation.pdfStateGallery);
  const greeting = `
  ${stateGallery}
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
    <div class="route-lbl">Your Journey Route</div>
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
  <div class="sec-head"><span class="ico">${ico('hotel', '#fff', 16)}</span><div><h2>Hotel-wise Breakdown</h2><div class="sub">Confirmed stays night by night</div></div></div>
  <div class="sec-panel">${hotelBreakdownCards}</div>` : '';

  const transferCards = transferDetails.map((d) => renderTransferCard(d)).join('');
  const transferSection = transferDetails.length ? `
  <div class="sec-head"><span class="ico">${ico('cab', '#fff', 16)}</span><div><h2>Transfer Details</h2><div class="sub">Vehicle assigned for your journey</div></div></div>
  <div class="sec-panel">${transferCards}</div>` : '';
  
  // ── Day-wise itinerary + hotel ───────────────────────────────────────────
  const dayCards = itinDays.map((dayEntry) => {
    const it      = dayEntry.selectedItinerary || {};
    const dayNum  = dayEntry.day;
    const hotel   = hotelMap.get(Number(dayNum));
    const hotelHtml = hotel ? renderHotelCard(hotel) : '';
    const cityAreaHtml = renderCityAreaHtml(it.cityArea, 'ptw');
    const similarHtml = renderSimilarHotelsHtml(dayEntry.similarhotel, 'ptw');

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
        ${it.itineraryDescription ? itinDesc(it.itineraryDescription) : ''}
        ${cityAreaHtml}
        ${hotelHtml}
        ${similarHtml}
      </div>
    </div>`;
  }).join('');

  // ── Pricing ──────────────────────────────────────────────────────────────
  const pricing = `
  <div class="sec-head"><span class="ico">${ico('money', '#fff', 16)}</span><div><h2>Cost Summary</h2><div class="sub">Transparent pricing breakdown</div></div></div>
  <div class="bill-card">
     ${renderGrandTotalRows(pricingInfo)}
  </div>`;

  // ── Inclusions / Exclusions ──────────────────────────────────────────────
  const makerCard = renderMakerCardHtml(operation.pdfMaker);
  const incExc = (pkg.packageInclusions || pkg.packageExclusions) ? `
  ${makerCard}
  <div class="sec-head"><span class="ico">${ico('check', '#fff', 16)}</span><div><h2>Inclusions &amp; Exclusions</h2></div></div>
  <div class="sec-panel"><div class="ie-grid">
    <div class="ie-col inc">
      <div class="ie-head inc">Inclusions</div>
      ${formatContentBlocks(pkg.packageInclusions)}
    </div>
    <div class="ie-col exc">
      <div class="ie-head exc">Exclusions</div>
      ${formatContentBlocks(pkg.packageExclusions)}
    </div>
  </div></div>` : `${makerCard}`;

  // ── Policies (customExclusions) ──────────────────────────────────────────
  const policyHtml = policies.map(p => `
  <div class="policy">
    <div class="policy-head">${esc(p.name)}</div>
    <div class="policy-body">${formatContentBlocks(p.description)}</div>
  </div>`).join('');

  const policiesSection = policyHtml ? `
  <div class="sec-head"><span class="ico">${ico('list', '#fff', 16)}</span><div><h2>Policies &amp; Terms</h2></div></div>
  <div class="sec-panel">${policyHtml}</div>` : '';

  // ── Bank ─────────────────────────────────────────────────────────────────
  const bankSection = `
  <div class="sec-head"><span class="ico">${ico('bank', '#fff', 16)}</span><div><h2>Payment Details</h2><div class="sub">Secure bank transfer information</div></div></div>
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
    ${renderSocialIconsHtml('ptw')}
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
  <div class="page-shell">
  ${pgHeader}
  ${cover}
  ${guestStrip}
  ${greeting}
  ${routeSection}

  ${packageDescriptionSection}
  ${hotelBreakdown}
  ${transferSection}

  <div class="sec-head"><span class="ico">${ico('calendar', '#fff', 16)}</span><div><h2>Day-wise Itinerary &amp; Stays</h2><div class="sub">Each day planned with matching hotel</div></div></div>
  <div class="sec-panel">${dayCards}</div>

  ${pricing}
  ${incExc}
  ${policiesSection}
  ${bankSection}
  ${footer}
  </div>
</body>
</html>`;
}
