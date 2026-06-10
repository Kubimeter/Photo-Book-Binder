const S = {
  numLagen: 6, blaetter: 4, curSpread: 0,
  pages: [], photos: [],
  selPage: null, selSlot: null, selDbl: false,
  editEl: null, editKey: null,
  zoom: 110, blScope: 'dbl', margin: 3, imgScale: 100
};
const A6W = 105, A6H = 148, PDF_H = 148.5;

const bitmapCache = new Map();

function getBitmap(photo) {

  return bitmapCache.get(photo.url) || photo.img;
}

const MAX_DISPLAY_PX = 900;

function loadImg(url) {
  return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = url; });
}

async function makeDisplayImg(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const scale = Math.min(1, MAX_DISPLAY_PX / Math.max(W, H));
  if (scale >= 1) {

    try { return await createImageBitmap(img); } catch { return img; }
  }
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  try { return await createImageBitmap(cv); } catch { return cv; }
}

function drawTransformed(ctx, img, cw, ch, pan, scale, crop) {
  if (!img) return;
  pan = pan || { x: 0, y: 0 }; scale = scale || 1;
  let sx = 0, sy = 0, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  if (crop) { sx = crop.x * sw; sy = crop.y * sh; sw = crop.w * sw; sh = crop.h * sh; }
  const ir = sw / sh, cr = cw / ch;
  let bw, bh;
  if (ir > cr) { bh = ch; bw = bh * ir; } else { bw = cw; bh = bw / ir; }
  bw *= scale; bh *= scale;
  ctx.drawImage(img, sx, sy, sw, sh, (cw - bw) / 2 + pan.x * cw, (ch - bh) / 2 + pan.y * ch, bw, bh);
}

function totalPages() { return S.numLagen * S.blaetter * 4; }
function totalSpreads() { return totalPages() / 2 + 1; }
function spreadPages(si) {
  const total = totalSpreads();
  const li = si === 0 ? -1 : 2 * si - 1;
  const ri = si === total - 1 ? -1 : 2 * si;
  return [li, ri];
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function clampPan(pan, scale, cw, ch, img, crop) {
  if (!img || !pan) return pan || { x: 0, y: 0 };
  let sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  if (crop) { sw *= crop.w; sh *= crop.h; }
  const ir = sw / sh, cr = cw / ch;
  let bw, bh;
  if (ir > cr) { bh = ch; bw = bh * ir; } else { bw = cw; bh = bw / ir; }
  bw *= scale; bh *= scale;
  const mx = bw > cw ? (bw - cw) / (2 * cw) : 0.5;
  const my = bh > ch ? (bh - ch) / (2 * ch) : 0.5;
  return { x: clamp(pan.x, -mx, mx), y: clamp(pan.y, -my, my) };
}

let rebT = null;
function dRebuild() { clearTimeout(rebT); rebT = setTimeout(rebuildBook, 350); }
let _zT = null;
function dZoom(v) { S.zoom = v; clearTimeout(_zT); _zT = setTimeout(() => renderSpread(), 60); }
let _mT = null;
function dMarginVal(v) {
  S.margin = v;
  document.getElementById('marginVal').textContent = v + ' mm';
  clearTimeout(_mT); _mT = setTimeout(() => { renderAll(); }, 80);
}
function setImgScale(v) { S.imgScale = v; document.getElementById('imgScaleVal').textContent = v + '%'; }

function mkPage() { return { bg: '#fff', layout: 1, slots: [], bl: false, dbl: null }; }
function mkSlot(url, img) { return { photo: url, img, pan: { x: 0, y: 0 }, scale: S.imgScale / 100, crop: null }; }

function rebuildBook() {
  S.numLagen = clamp(parseInt(document.getElementById('iLagen').value) || 6, 1, 20);
  S.blaetter = clamp(parseInt(document.getElementById('iBlaetter').value) || 4, 2, 8);
  const n = totalPages(), old = S.pages; S.pages = [];
  for (let i = 0; i < n; i++) S.pages.push(old[i] || mkPage());
  S.curSpread = clamp(S.curSpread, 0, totalSpreads() - 1);
  document.getElementById('ml-b').textContent = S.blaetter;
  document.getElementById('ml-l').textContent = S.numLagen;
  renderAll();
}

function slotGeom(n, W, H, bl, innerEdge, pxPerMm) {
  const mm = pxPerMm || 1;
  const full = (bl === true || bl === 'full'), inner = (bl === 'inner');
  const p = full ? 0 : S.margin * mm;
  const g = full || inner ? 0 : S.margin * mm;
  const pl = (inner && innerEdge === 'left') ? 0 : p;
  const pr = (inner && innerEdge === 'right') ? 0 : p;
  const pt = p, pb = p;
  const W2 = W - pl - pr, H2 = H - pt - pb;
  if (n === 1) return [{ x: pl, y: pt, w: W2, h: H2 }];
  if (n === 2) return [
    { x: pl, y: pt, w: W2, h: (H2 - g) / 2 },
    { x: pl, y: pt + (H2 - g) / 2 + g, w: W2, h: (H2 - g) / 2 }
  ];
  if (n === 4) {
    const cw = (W2 - g) / 2, rh = (H2 - g) / 2;
    return [
      { x: pl, y: pt, w: cw, h: rh }, { x: pl + cw + g, y: pt, w: cw, h: rh },
      { x: pl, y: pt + rh + g, w: cw, h: rh }, { x: pl + cw + g, y: pt + rh + g, w: cw, h: rh }
    ];
  }
  if (n === 6) {
    const cw = (W2 - g) / 2, rh = (H2 - 2 * g) / 3, r = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 2; col++)
        r.push({ x: pl + col * (cw + g), y: pt + row * (rh + g), w: cw, h: rh });
    return r;
  }
  return [{ x: pl, y: pt, w: W2, h: H2 }];
}

function pxPerMm() { return 2.78 * S.zoom / 100; }

let _sc = null;
let _scCtx = null;
let _scPW = 0, _scPH = 0, _scSP = 0, _scPPM = 0;
let _scSlots = [];
let _scEditIdx = -1;

function slotSig(slD, bg) {
  if (!slD || !slD.photo) return bg + '|empty';
  return slD.photo + '|' + (slD.pan ? slD.pan.x.toFixed(3) + ',' + slD.pan.y.toFixed(3) : '0,0')
    + '|' + (slD.scale || 1).toFixed(3)
    + '|' + (slD.crop ? slD.crop.x.toFixed(3) + slD.crop.y.toFixed(3) + slD.crop.w.toFixed(3) + slD.crop.h.toFixed(3) : '')
    + '|' + bg;
}

function renderSpread() {
  const ppm = pxPerMm();
  const PW = Math.round(A6W * ppm), PH = Math.round(A6H * ppm), SP = Math.max(3, Math.round(5 * S.zoom / 100));
  const wrap = document.getElementById('bSpread');

  if (!_sc) {
    _sc = document.createElement('canvas');
    _sc.style.cssText = 'display:block;box-shadow:0 4px 24px rgba(0,0,0,.7);border-radius:2px;cursor:pointer;';
    _sc.addEventListener('click', _scClick);
    _sc.addEventListener('dblclick', _scClick);
    _sc.addEventListener('dragover', e => e.preventDefault());
    _sc.addEventListener('drop', _scDrop);
    wrap.innerHTML = '';
    wrap.appendChild(_sc);
    _scCtx = _sc.getContext('2d');
  }

  const totalW = PW + SP + PW;
  if (_sc.width !== totalW || _sc.height !== PH) {
    _sc.width = totalW; _sc.height = PH;
  }
  _scPW = PW; _scPH = PH; _scSP = SP; _scPPM = ppm;

  _paintSpread();

  const [_li, _ri] = spreadPages(S.curSpread);
  const _pgL = _li >= 0 ? (S.pages[_li] || mkPage()) : mkPage();
  const _hasDbl = _li >= 0 && _ri >= 0 && !!_pgL.dbl;
  const ppl = S.blaetter * 4;
  const noteIdx = _ri >= 0 ? _ri : (_li >= 0 ? _li : 0);
  document.getElementById('sNote').textContent =
    `Signature ${Math.floor(noteIdx / ppl) + 1} of ${S.numLagen}  ·  Sheet ${Math.floor((noteIdx % ppl) / 4) + 1} of ${S.blaetter}`;
  document.getElementById('sInfo').textContent = `Spread ${S.curSpread + 1} of ${totalSpreads()}`;
  document.getElementById('sb4').textContent = `Spread ${S.curSpread + 1}`;
  updateControls(_li >= 0 ? _li : 0, _pgL, _hasDbl);
}

function _paintSpread() {
  if (!_sc || !_scCtx) return;
  const ctx = _scCtx;
  const PW = _scPW, PH = _scPH, SP = _scSP, ppm = _scPPM;
  const totalW = PW + SP + PW;
  const [li, ri] = spreadPages(S.curSpread);
  const isCover = S.curSpread === 0, isBack = S.curSpread === totalSpreads() - 1;
  const displayLeftIdx = li;
  const displayRightIdx = ri;
  const pgL = li >= 0 ? (S.pages[li] || mkPage()) : mkPage();
  const pgR = ri >= 0 ? (S.pages[ri] || mkPage()) : mkPage();
  const hasDbl = li >= 0 && ri >= 0 && !!pgL.dbl;

  ctx.clearRect(0, 0, totalW, PH);
  _scSlots = [];

  ctx.fillStyle = li < 0 ? '#2a2820' : (pgL.bg || '#fff');
  ctx.fillRect(0, 0, PW, PH);
  if (li < 0) {
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('(Inner back cover)', PW / 2, PH / 2);
  } else if (!hasDbl) {
    _paintPage(ctx, li, pgL, 0, 0, PW, PH, ppm, 'left');
  }

  const spGrad = ctx.createLinearGradient(PW, 0, PW + SP, 0);
  spGrad.addColorStop(0, '#aaa8a0'); spGrad.addColorStop(0.5, '#ece8de'); spGrad.addColorStop(1, '#aaa8a0');
  ctx.fillStyle = spGrad; ctx.fillRect(PW, 0, SP, PH);

  ctx.fillStyle = ri < 0 ? '#2a2820' : (pgR.bg || '#fff');
  ctx.fillRect(PW + SP, 0, PW, PH);
  if (ri < 0) {
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('(Inner back cover)', PW + SP + PW / 2, PH / 2);
  } else if (!hasDbl) {
    _paintPage(ctx, ri, pgR, PW + SP, 0, PW, PH, ppm, 'right');
    if (isCover) {
      ctx.fillStyle = '#c08020';
      ctx.fillRect(PW + SP + 4, 4, 36, 14);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('COVER', PW + SP + 4 + 18, 4 + 10);
    }
  }

  if (hasDbl) {
    _paintDbl(ctx, displayLeftIdx, pgL, PW, PH, SP, ppm);
  }

  ctx.font = '7px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  if (!isCover && displayLeftIdx >= 0) { ctx.textAlign = 'left'; ctx.fillText('p.' + (displayLeftIdx + 1), 4, PH - 3); }
  if (!isBack && displayRightIdx >= 0) { ctx.textAlign = 'right'; ctx.fillText('p.' + (displayRightIdx + 1), totalW - 4, PH - 3); }
  if (isBack) { ctx.textAlign = 'left'; ctx.fillText('p.' + (ri + 1), 4, PH - 3); }

  if (_scEditIdx >= 0 && _scEditIdx < _scSlots.length) {
    const sl = _scSlots[_scEditIdx];
    ctx.strokeStyle = '#9333ea'; ctx.lineWidth = 2;
    ctx.strokeRect(sl.x + 1, sl.y + 1, sl.w - 2, sl.h - 2);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(sl.x + sl.w - 95, sl.y + 3, 92, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('Scroll=Zoom · Drag=Pan', sl.x + sl.w - 4, sl.y + 12);
    _drawEditBar(ctx, sl);
  }
}

function _paintPage(ctx, pageIdx, pg, ox, oy, PW, PH, ppm, side) {
  const innerEdge = side === 'left' ? 'right' : 'left';
  const slots = slotGeom(pg.layout || 1, PW, PH, pg.bl, innerEdge, ppm);
  const full = (pg.bl === true || pg.bl === 'full'), inner = (pg.bl === 'inner');
  slots.forEach((sl, si) => {
    const slD = pg.slots[si];
    const ax = ox + sl.x, ay = oy + sl.y;

    ctx.fillStyle = pg.bg || '#fff'; ctx.fillRect(ax, ay, sl.w, sl.h);
    if (slD && slD.img) {
      const src = bitmapCache.get(slD.photo) || slD.img;
      ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, sl.w, sl.h); ctx.clip();
      _drawTransformedAt(ctx, src, ax, ay, sl.w, sl.h, slD.pan, slD.scale, slD.crop);
      ctx.restore();
      _scSlots.push({ pageIdx, slotIdx: si, x: ax, y: ay, w: sl.w, h: sl.h, isDbl: false });
    } else {
      if (!full && !inner) {
        ctx.strokeStyle = 'rgba(120,120,120,0.45)'; ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]); ctx.strokeRect(ax + 0.5, ay + 0.5, sl.w - 1, sl.h - 1); ctx.setLineDash([]);
      }
      ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('+ Photo', ax + sl.w / 2, ay + sl.h / 2 + 3);
      _scSlots.push({ pageIdx, slotIdx: si, x: ax, y: ay, w: sl.w, h: sl.h, isDbl: false, empty: true });
    }
  });
}

function _paintDbl(ctx, li, pgL, PW, PH, SP, ppm) {
  const totalW = PW + SP + PW;
  const blMode = pgL.bl;
  const full = (blMode === true || blMode === 'full'), inner = (blMode === 'inner');
  const p = full ? 0 : S.margin * ppm;

  const pt = p, pb = p, pl = p, pr = p;

  const imgX = pl, imgY = pt;
  const imgW = totalW - pl - pr;
  const imgH = PH - pt - pb;
  ctx.fillStyle = pgL.bg || '#fff'; ctx.fillRect(0, 0, totalW, PH);
  if (pgL.dbl && pgL.dbl.img) {
    const src = bitmapCache.get(pgL.dbl.photo) || pgL.dbl.img;
    ctx.save(); ctx.beginPath(); ctx.rect(imgX, imgY, imgW, imgH); ctx.clip();
    _drawTransformedAt(ctx, src, imgX, imgY, imgW, imgH, pgL.dbl.pan, pgL.dbl.scale, pgL.dbl.crop);
    ctx.restore();

    const fg = ctx.createLinearGradient(PW, 0, PW + SP, 0);
    fg.addColorStop(0, 'rgba(0,0,0,0.18)'); fg.addColorStop(0.5, 'rgba(0,0,0,0.04)'); fg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = fg; ctx.fillRect(PW, 0, SP, PH);
    _scSlots.push({ pageIdx: li, slotIdx: -1, x: 0, y: 0, w: totalW, h: PH, isDbl: true, empty: false });
  } else {
    ctx.fillStyle = 'rgba(100,100,200,0.15)';
    ctx.fillRect(0, 0, totalW, PH);
    ctx.strokeStyle = 'rgba(100,160,220,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.strokeRect(1, 1, totalW - 2, PH - 2); ctx.setLineDash([]);
    ctx.fillStyle = '#778'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('◫  Click or drop image -> double-page spread', totalW / 2, PH / 2);
    _scSlots.push({ pageIdx: li, slotIdx: -1, x: 0, y: 0, w: totalW, h: PH, isDbl: true, empty: true });
  }
}

function _drawTransformedAt(ctx, img, ox, oy, cw, ch, pan, scale, crop) {
  if (!img) return;
  pan = pan || { x: 0, y: 0 }; scale = scale || 1;
  let sx = 0, sy = 0, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  if (crop) { sx = crop.x * sw; sy = crop.y * sh; sw = crop.w * sw; sh = crop.h * sh; }
  const ir = sw / sh, cr = cw / ch;
  let bw, bh;
  if (ir > cr) { bh = ch; bw = bh * ir; } else { bw = cw; bh = bw / ir; }
  bw *= scale; bh *= scale;
  ctx.drawImage(img, sx, sy, sw, sh, ox + (cw - bw) / 2 + pan.x * cw, oy + (ch - bh) / 2 + pan.y * ch, bw, bh);
}

const _editBarIcons = {};
function _loadEditBarIcons() {
  const icons = {
    crop: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="white"><path d="M9,6.5C9,7.29 8.74,8 8.3,8.6L20,20.29V21H19.29L11.5,13.21L8.3,16.4C8.74,17 9,17.71 9,18.5C9,20.43 7.43,22 5.5,22C3.57,22 2,20.43 2,18.5C2,16.57 3.57,15 5.5,15C6.29,15 7,15.26 7.6,15.7L10.79,12.5L7.6,9.3C7,9.74 6.29,10 5.5,10C3.57,10 2,8.43 2,6.5C2,4.57 3.57,3 5.5,3C7.43,3 9,4.57 9,6.5M8,6.5C8,5.12 6.88,4 5.5,4C4.12,4 3,5.12 3,6.5C3,7.88 4.12,9 5.5,9C6.88,9 8,7.88 8,6.5M19.29,4H20V4.71L12.85,11.85L12.15,11.15L19.29,4M5.5,16C4.12,16 3,17.12 3,18.5C3,19.88 4.12,21 5.5,21C6.88,21 8,19.88 8,18.5C8,17.12 6.88,16 5.5,16Z"/></svg>`,
    reset: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="white"><path d="M5,5H10V10H9V6.5C6.65,7.47 5,9.79 5,12.5C5,16.08 7.91,19 11.5,19C15.09,19 18,16.09 18,12.5C18,9.42 15.86,6.84 13,6.17V5.14C16.42,5.84 19,8.86 19,12.5C19,16.63 15.64,20 11.5,20C7.36,20 4,16.64 4,12.5C4,9.72 5.5,7.3 7.74,6H5V5Z"/></svg>`,
    remove: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="white"><path d="M7,12H16V13H7V12M11.5,3C16.75,3 21,7.25 21,12.5C21,17.75 16.75,22 11.5,22C6.25,22 2,17.75 2,12.5C2,7.25 6.25,3 11.5,3M11.5,4C6.81,4 3,7.81 3,12.5C3,17.19 6.81,21 11.5,21C16.19,21 20,17.19 20,12.5C20,7.81 16.19,4 11.5,4Z"/></svg>`
  };

  Object.entries(icons).forEach(([key, svg]) => {
    const img = new Image();
    img.onload = () => {
      createImageBitmap(img).then(bmp => { _editBarIcons[key] = bmp; }).catch(() => { _editBarIcons[key] = img; });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
_loadEditBarIcons();

function _drawEditBar(ctx, sl) {
  const bw = 22, bh = 18, gap = 3, y = sl.y + sl.h - bh - 5;
  const btns = [
    { key: 'crop', color: '#1a5a20' },
    { key: 'reset', color: '#1a1a3a' },
    { key: 'remove', color: '#5a1a1a' }
  ];
  let x = sl.x + sl.w / 2 - (btns.length * (bw + gap) - gap) / 2;
  btns.forEach(b => {

    ctx.fillStyle = b.color + 'dd';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, bw, bh, 3) : ctx.rect(x, y, bw, bh);
    ctx.fill();

    const icon = _editBarIcons[b.key];
    if (icon) {
      const iw = 12, ih = 12;
      ctx.drawImage(icon, x + (bw - iw) / 2, y + (bh - ih) / 2, iw, ih);
    }
    x += bw + gap;
  });
}

function _hitSlot(cx, cy) {

  if (_scEditIdx >= 0 && _scEditIdx < _scSlots.length) {
    const sl = _scSlots[_scEditIdx];
    const bw = 22, bh = 18, gap = 3, y = sl.y + sl.h - bh - 5;
    const btns = [{ label: '✂' }, { label: '↺' }, { label: '✕' }];
    let x = sl.x + sl.w / 2 - (btns.length * (bw + gap) - gap) / 2;
    for (let i = 0; i < btns.length; i++) {
      if (cx >= x && cx < x + bw && cy >= y && cy < y + bh) return { barBtn: i, slot: _scSlots[_scEditIdx] };
      x += bw + gap;
    }
  }
  for (let i = _scSlots.length - 1; i >= 0; i--) {
    const s = _scSlots[i];
    if (cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h) return { idx: i, slot: s };
  }
  return null;
}

function _getCanvasPos(e) {
  const r = _sc.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (_sc.width / r.width), y: (e.clientY - r.top) * (_sc.height / r.height) };
}

function _scClick(e) {
  if (!_sc) return;
  const { x, y } = _getCanvasPos(e);
  const hit = _hitSlot(x, y);
  if (!hit) { _scEditIdx = -1; _paintSpread(); return; }

  if (hit.barBtn !== undefined) {
    const sl = hit.slot;
    if (sl.isDbl) {
      if (hit.barBtn === 0) cropSlot(null, true);
      else if (hit.barBtn === 1) resetT(null, true);
      else removeSlotPhoto(null, true);
    } else {
      if (hit.barBtn === 0) cropSlot({ pageIdx: sl.pageIdx, slotIdx: sl.slotIdx }, false);
      else if (hit.barBtn === 1) resetT({ pageIdx: sl.pageIdx, slotIdx: sl.slotIdx }, false);
      else removeSlotPhoto({ pageIdx: sl.pageIdx, slotIdx: sl.slotIdx }, false);
    }
    return;
  }

  const sl = hit.slot;
  if (sl.empty) {

    if (sl.isDbl) { dblClick(); }
    else { slotClick(sl.pageIdx, sl.slotIdx); }
    return;
  }

  if (_scEditIdx === hit.idx) { return; }
  _scEditIdx = hit.idx;

  S.editKey = sl.isDbl ? { dbl: true, pageIdx: sl.pageIdx } : { pageIdx: sl.pageIdx, slotIdx: sl.slotIdx };
  S.editEl = _sc;
  _paintSpread();
}

function _scDrop(e) {
  e.preventDefault();
  const { x, y } = _getCanvasPos(e);
  const hit = _hitSlot(x, y);

  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    if (hit && hit.slot) {
      const sl = hit.slot;
      if (sl.isDbl) handleFiles(e.dataTransfer.files, null, null, true);
      else handleFiles(e.dataTransfer.files, sl.pageIdx, sl.slotIdx, false);
    } else {
      handleFiles(e.dataTransfer.files);
    }
    return;
  }

  const idx = parseInt(e.dataTransfer.getData('pi'));
  if (!isNaN(idx) && S.photos[idx]) {
    if (hit && hit.slot) {
      const sl = hit.slot;
      if (sl.isDbl) assignDblPhoto(S.photos[idx]);
      else assignPhoto(sl.pageIdx, sl.slotIdx, S.photos[idx]);
    }
  }
}

function activateEdit(el, key) {

  const idx = _scSlots.findIndex(s =>
    key.dbl ? s.isDbl : (s.pageIdx === key.pageIdx && s.slotIdx === key.slotIdx)
  );
  _scEditIdx = idx;
  S.editKey = key; S.editEl = _sc;
  _paintSpread();
}
function deactivateEdit() {
  _scEditIdx = -1; S.editEl = null; S.editKey = null;
  _paintSpread();
}

function renderSpreadSoft() {

  _paintSpread();
}

function addPN() { }
function addCL() { }
function fillPageBg() { }
function makeBar() { return document.createElement('span'); }
function fillPageEl() { }

function getSD(key) {
  if (!key) return null;
  if (key.dbl) return S.pages[key.pageIdx] && S.pages[key.pageIdx].dbl;
  const pg = S.pages[key.pageIdx]; return pg && pg.slots[key.slotIdx];
}

function redrawActive() {
  _paintSpread();
}

function resetT(key) {
  const k = key || S.editKey; if (!k) return;
  const sd = getSD(k);
  if (sd) { sd.pan = { x: 0, y: 0 }; sd.scale = S.imgScale / 100; sd.crop = null; }
  _scEditIdx = -1;
  renderAll();
}

function removeSlotPhoto(key) {
  const k = key || S.editKey; if (!k) return;
  markUsedDirty();
  if (k.dbl) {
    const pg = S.pages[k.pageIdx];
    if (pg && pg.dbl) pg.dbl = { photo: null, img: null, pan: { x: 0, y: 0 }, scale: 1, crop: null };
  } else {
    const pg = S.pages[k.pageIdx];
    if (pg) pg.slots[k.slotIdx] = {};
  }
  deactivateEdit(); renderAll();
}

let drag = { active: false, startX: 0, startY: 0, startPan: null, rect: null };
document.addEventListener('mousedown', e => {
  if (!S.editEl || !S.editKey) return;

  if (e.target !== _sc) return;
  const sd = getSD(S.editKey); if (!sd || !sd.img) return;
  drag.active = true; drag.startX = e.clientX; drag.startY = e.clientY;
  drag.startPan = { x: (sd.pan || { x: 0 }).x, y: (sd.pan || { y: 0 }).y };

  if (_scEditIdx >= 0 && _scSlots[_scEditIdx]) {
    const sl = _scSlots[_scEditIdx];
    const canvRect = _sc.getBoundingClientRect();
    const scaleX = canvRect.width / _sc.width, scaleY = canvRect.height / _sc.height;
    drag.rect = {
      left: canvRect.left + sl.x * scaleX, top: canvRect.top + sl.y * scaleY,
      width: sl.w * scaleX, height: sl.h * scaleY
    };
  } else {
    drag.rect = S.editEl.getBoundingClientRect();
  }
  e.preventDefault();
});

let _pRaf = null, _pmx = 0, _pmy = 0;
document.addEventListener('mousemove', e => {
  if (!drag.active || !S.editEl || !S.editKey) return;
  _pmx = e.clientX; _pmy = e.clientY;
  if (_pRaf) return;
  _pRaf = requestAnimationFrame(() => {
    _pRaf = null;
    const sd = getSD(S.editKey); if (!sd || !sd.img) return;
    const cv = _sc; if (!cv) return;
    const cw = cv.width, ch = cv.height, rect = drag.rect;
    const sl2 = _scEditIdx >= 0 ? _scSlots[_scEditIdx] : null;
    const scw = sl2 ? sl2.w : cw, sch = sl2 ? sl2.h : ch;
    sd.pan = clampPan(
      {
        x: drag.startPan.x + (_pmx - drag.startX) / rect.width,
        y: drag.startPan.y + (_pmy - drag.startY) / rect.height
      },
      sd.scale || 1, scw, sch, sd.img, sd.crop
    );
    renderSpreadSoft();
  });
});
document.addEventListener('mouseup', () => { drag.active = false; });
document.addEventListener('click', e => {
  if (!S.editEl) return;
  if (e.target !== _sc) deactivateEdit();
});

let _wRaf = null, _wDelta = 0;
document.addEventListener('wheel', e => {
  if (!S.editEl || !S.editKey || (e.target !== _sc && !S.editEl.contains(e.target))) return;
  e.preventDefault();
  _wDelta += (e.deltaY > 0 ? -0.08 : 0.08);
  if (_wRaf) return;
  _wRaf = requestAnimationFrame(() => {
    _wRaf = null;
    const sd = getSD(S.editKey); if (!sd || !sd.img) return;
    if (!_sc) return;
    sd.scale = clamp((sd.scale || 1) + _wDelta, 0.1, 5); _wDelta = 0;
    const _sl = _scEditIdx >= 0 ? _scSlots[_scEditIdx] : null;
    const _scw = _sl ? _sl.w : _sc.width, _sch = _sl ? _sl.h : _sc.height;
    sd.pan = clampPan(sd.pan || { x: 0, y: 0 }, sd.scale, _scw, _sch, sd.img, sd.crop);
    _wDelta = 0;
    renderSpreadSoft();
  });
}, { passive: false });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    deactivateEdit();
    if (document.getElementById('cropModal').style.display !== 'none') cropCancel();
    return;
  }
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') prevS();
  if (e.key === 'ArrowRight') nextS();
});

const CROP = {
  key: null, isDbl: false,
  slotAR: 1,

  cx: 0, cy: 0, cw: 0, ch: 0,

  dScale: 1,

  iW: 0, iH: 0,

  srcImg: null,
  canvas: null, ctx: null,
  drag: null
};

function cropSlot(key, isDbl) {
  const k = key || S.editKey;
  const sd = k ? (isDbl || (k && k.dbl)
    ? S.pages[k.pageIdx] && S.pages[k.pageIdx].dbl
    : S.pages[k.pageIdx] && S.pages[k.pageIdx].slots[k.slotIdx]) : null;
  if (!sd || !sd.img) return;

  CROP.key = k; CROP.isDbl = isDbl || (k && k.dbl);

  CROP.slotAR = A6W / A6H;
  if (!CROP.isDbl && k && !k.dbl) {
    const painted = _scSlots.find(s => !s.isDbl && s.pageIdx === k.pageIdx && s.slotIdx === k.slotIdx);
    if (painted) CROP.slotAR = painted.w / painted.h;
  } else if (CROP.isDbl) {
    const painted = _scSlots.find(s => s.isDbl);
    CROP.slotAR = painted ? painted.w / painted.h : 2;
  }

  const fullSrc = getFullImg(sd.photo);
  const srcImg = (fullSrc && !(fullSrc instanceof ImageBitmap)) ? fullSrc : sd.img;
  CROP.srcImg = srcImg;

  waitForImg(srcImg).then(img => {
    if (!img) img = sd.img;
    CROP.srcImg = img;
    const iW = img.naturalWidth || img.width;
    const iH = img.naturalHeight || img.height;
    CROP.iW = iW; CROP.iH = iH;

    const maxW = Math.min(700, window.innerWidth - 60);
    const maxH = Math.min(560, window.innerHeight - 180);
    const dS = Math.min(maxW / iW, maxH / iH);
    CROP.dScale = dS;
    const cvW = Math.round(iW * dS), cvH = Math.round(iH * dS);

    const wrap = document.getElementById('cropWrap');
    wrap.style.cssText = `width:${cvW}px;height:${cvH}px;cursor:crosshair;position:relative;`;
    if (!CROP.canvas) {
      CROP.canvas = document.createElement('canvas');
      CROP.canvas.style.cssText = 'display:block;';
      CROP.ctx = CROP.canvas.getContext('2d');
      CROP.canvas.addEventListener('mousedown', _cropMouseDown);
      CROP.canvas.addEventListener('mousemove', _cropMouseMove);
      CROP.canvas.addEventListener('mouseup', _cropMouseUp);
      CROP.canvas.addEventListener('mouseleave', _cropMouseUp);
      wrap.innerHTML = '';
      wrap.appendChild(CROP.canvas);
    } else {
      wrap.innerHTML = '';
      wrap.appendChild(CROP.canvas);
    }
    CROP.canvas.width = cvW; CROP.canvas.height = cvH;

    const ec = sd.crop;
    if (ec) {
      CROP.cx = ec.x * iW * dS;
      CROP.cy = ec.y * iH * dS;
      CROP.cw = ec.w * iW * dS;
      CROP.ch = ec.h * iH * dS;
    } else {

      _cropFitSlot();
    }

    _cropDraw();
    document.getElementById('cropModal').style.display = 'flex';
  });
}

function _cropFitSlot() {
  const totalW = CROP.iW * CROP.dScale;
  const totalH = CROP.iH * CROP.dScale;
  const ar = CROP.slotAR;
  let cw, ch;
  if (totalW / totalH > ar) { ch = totalH; cw = ch * ar; }
  else { cw = totalW; ch = cw / ar; }
  CROP.cx = (totalW - cw) / 2;
  CROP.cy = (totalH - ch) / 2;
  CROP.cw = cw; CROP.ch = ch;
}

function _cropDraw() {
  const cv = CROP.canvas, ctx = CROP.ctx;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(CROP.srcImg, 0, 0, W, H);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const { cx, cy, cw, ch } = CROP;
  ctx.fillRect(0, 0, W, cy);
  ctx.fillRect(0, cy + ch, W, H - cy - ch);
  ctx.fillRect(0, cy, cx, ch);
  ctx.fillRect(cx + cw, cy, W - cx - cw, ch);

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx + 0.75, cy + 0.75, cw - 1.5, ch - 1.5);

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(cx + cw * i / 3, cy); ctx.lineTo(cx + cw * i / 3, cy + ch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + ch * i / 3); ctx.lineTo(cx + cw, cy + ch * i / 3); ctx.stroke();
  }

  const ar = CROP.slotAR;
  const guideW = Math.min(cw, ch * ar);
  const guideH = guideW / ar;
  const gx = cx + (cw - guideW) / 2, gy = cy + (ch - guideH) / 2;
  if (Math.abs(guideW - cw) > 2 || Math.abs(guideH - ch) > 2) {
    ctx.strokeStyle = 'rgba(147,51,234,0.7)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.strokeRect(gx, gy, guideW, guideH);
    ctx.setLineDash([]);
  }

  const hs = 8;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  const handles = _cropHandleRects();
  handles.forEach(h => {
    ctx.fillRect(h.x, h.y, hs, hs);
    ctx.strokeRect(h.x + 0.5, h.y + 0.5, hs - 1, hs - 1);
  });

  const pct = Math.round(CROP.cw / CROP.iW / CROP.dScale * 100);
  document.getElementById('cropInfo').textContent =
    `${Math.round(CROP.cw / CROP.dScale)}×${Math.round(CROP.ch / CROP.dScale)}px  ·  slot ratio ${CROP.slotAR.toFixed(2)}`;
}

function _cropHandleRects() {
  const { cx, cy, cw, ch } = CROP;
  const hs = 8, h = hs / 2;
  return [
    { x: cx - h, y: cy - h, id: 'tl' },
    { x: cx + cw / 2 - h, y: cy - h, id: 'tc' },
    { x: cx + cw - h, y: cy - h, id: 'tr' },
    { x: cx + cw - h, y: cy + ch / 2 - h, id: 'rc' },
    { x: cx + cw - h, y: cy + ch - h, id: 'br' },
    { x: cx + cw / 2 - h, y: cy + ch - h, id: 'bc' },
    { x: cx - h, y: cy + ch - h, id: 'bl' },
    { x: cx - h, y: cy + ch / 2 - h, id: 'lc' },
  ];
}

function _cropHitHandle(mx, my) {
  const hs = 12;
  const h2 = hs / 2;
  const handles = _cropHandleRects();
  for (const h of handles) {
    if (mx >= h.x - h2 && mx <= h.x + hs + h2 && my >= h.y - h2 && my <= h.y + hs + h2) return h.id;
  }
  return null;
}

function _cropInsideBox(mx, my) {
  return mx > CROP.cx && mx < CROP.cx + CROP.cw && my > CROP.cy && my < CROP.cy + CROP.ch;
}

function _cropMouseDown(e) {
  e.preventDefault();
  const r = CROP.canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (CROP.canvas.width / r.width);
  const my = (e.clientY - r.top) * (CROP.canvas.height / r.height);
  const handle = _cropHitHandle(mx, my);
  if (handle) {
    CROP.drag = {
      type: 'handle', h: handle, sx: mx, sy: my,
      cx0: CROP.cx, cy0: CROP.cy, cw0: CROP.cw, ch0: CROP.ch
    };
  } else if (_cropInsideBox(mx, my)) {
    CROP.drag = {
      type: 'move', sx: mx, sy: my,
      cx0: CROP.cx, cy0: CROP.cy, cw0: CROP.cw, ch0: CROP.ch
    };
    CROP.canvas.style.cursor = 'grabbing';
  } else {

    CROP.drag = {
      type: 'new', sx: mx, sy: my,
      cx0: mx, cy0: my, cw0: 0, ch0: 0
    };
  }
}

function _cropMouseMove(e) {
  if (!CROP.drag) {

    const r = CROP.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (CROP.canvas.width / r.width);
    const my = (e.clientY - r.top) * (CROP.canvas.height / r.height);
    const h = _cropHitHandle(mx, my);
    const cursors = {
      tl: 'nw-resize', tr: 'ne-resize', bl: 'sw-resize', br: 'se-resize',
      tc: 'n-resize', bc: 's-resize', lc: 'w-resize', rc: 'e-resize'
    };
    CROP.canvas.style.cursor = h ? (cursors[h] || 'crosshair') : _cropInsideBox(mx, my) ? 'grab' : 'crosshair';
    return;
  }
  const r = CROP.canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (CROP.canvas.width / r.width);
  const my = (e.clientY - r.top) * (CROP.canvas.height / r.height);
  const dx = mx - CROP.drag.sx, dy = my - CROP.drag.sy;
  const W = CROP.canvas.width, H = CROP.canvas.height;
  const MIN = 20;
  const { cx0, cy0, cw0, ch0 } = CROP.drag;

  if (CROP.drag.type === 'move') {
    CROP.cx = clamp(cx0 + dx, 0, W - CROP.cw);
    CROP.cy = clamp(cy0 + dy, 0, H - CROP.ch);
  } else if (CROP.drag.type === 'new') {
    const x1 = Math.min(CROP.drag.sx, mx), y1 = Math.min(CROP.drag.sy, my);
    const x2 = Math.max(CROP.drag.sx, mx), y2 = Math.max(CROP.drag.sy, my);
    CROP.cx = clamp(x1, 0, W - MIN); CROP.cy = clamp(y1, 0, H - MIN);
    CROP.cw = clamp(x2 - x1, MIN, W - CROP.cx);
    CROP.ch = clamp(y2 - y1, MIN, H - CROP.cy);
  } else {

    let cx = cx0, cy = cy0, cw = cw0, ch = ch0;
    const h = CROP.drag.h;
    if (h.includes('l')) { const nx = clamp(cx0 + dx, 0, cx0 + cw0 - MIN); cw -= nx - cx; cx = nx; }
    if (h.includes('r')) { cw = clamp(cw0 + dx, MIN, W - cx); }
    if (h.includes('t')) { const ny = clamp(cy0 + dy, 0, cy0 + ch0 - MIN); ch -= ny - cy; cy = ny; }
    if (h.includes('b')) { ch = clamp(ch0 + dy, MIN, H - cy); }
    if (h === 'tc' || h === 'bc') { cx = cx0; cw = cw0; }
    if (h === 'lc' || h === 'rc') { cy = cy0; ch = ch0; }
    CROP.cx = cx; CROP.cy = cy; CROP.cw = cw; CROP.ch = ch;
  }
  _cropDraw();
}

function _cropMouseUp() {
  CROP.drag = null;
  CROP.canvas.style.cursor = 'crosshair';
}

function cropReset() {
  CROP.cx = 0; CROP.cy = 0;
  CROP.cw = CROP.canvas.width; CROP.ch = CROP.canvas.height;
  _cropDraw();
}

function cropAspectSlot() {
  _cropFitSlot();
  _cropDraw();
}

function cropApply() {
  const sd = CROP.key ? (CROP.isDbl
    ? S.pages[CROP.key.pageIdx] && S.pages[CROP.key.pageIdx].dbl
    : S.pages[CROP.key.pageIdx] && S.pages[CROP.key.pageIdx].slots[CROP.key.slotIdx]) : null;
  if (sd) {

    const d = CROP.dScale;
    sd.crop = {
      x: CROP.cx / d / CROP.iW,
      y: CROP.cy / d / CROP.iH,
      w: CROP.cw / d / CROP.iW,
      h: CROP.ch / d / CROP.iH
    };
    sd.pan = { x: 0, y: 0 }; sd.scale = 1;
  }
  document.getElementById('cropModal').style.display = 'none';
  renderAll();
}

function cropCancel() {
  document.getElementById('cropModal').style.display = 'none';
}

function cropUpdateBox() { }

let _lastLageCount = -1, _lastLageSpread = -1;
function renderLageList() {
  const el = document.getElementById('lageList');
  const changed = el.childElementCount !== S.numLagen || _lastLageCount !== S.numLagen;
  if (changed) {
    _lastLageCount = S.numLagen;
    el.innerHTML = '';
    for (let l = 1; l <= S.numLagen; l++) {
      const first = (l - 1) * S.blaetter * 4, fs = first / 2;
      const d = document.createElement('div');
      d.className = 'lage-item';

      const spreadStart = Math.floor(first / 2);
      const spreadEnd = Math.floor((first + S.blaetter * 4 - 1) / 2) + 1;
      d.dataset.fs = spreadStart;
      d.dataset.fe = spreadEnd;
      const name = document.createElement('span'); name.textContent = `Sig. ${l}`;
      const badge = document.createElement('span'); badge.className = 'badge';
      badge.textContent = `p.${first + 1}–${first + S.blaetter * 4}`;
      d.appendChild(name); d.appendChild(badge);
      d.onclick = () => { S.curSpread = fs; renderAll(); };
      el.appendChild(d);
    }
  }

  el.querySelectorAll('.lage-item').forEach(d => {
    const fs = +d.dataset.fs, fe = +d.dataset.fe;
    d.classList.toggle('act', S.curSpread >= fs && S.curSpread <= fe);
  });
  _lastLageSpread = S.curSpread;
}

const thumbCache = new Map();
function getThumb(pg, i) {
  const s0 = pg.slots[0];
  const sig = s0 && s0.photo
    ? s0.photo + '|' + (s0.pan ? s0.pan.x.toFixed(2) + ',' + s0.pan.y.toFixed(2) : '') + '|' + (s0.scale || 1) + '|' + (s0.crop ? JSON.stringify(s0.crop) : '')
    : '';
  const cached = thumbCache.get(i);
  if (cached && cached.sig === sig) return cached.url;
  if (!s0 || !s0.img) { thumbCache.set(i, { sig, url: null }); return null; }
  const cv = document.createElement('canvas'); cv.width = 60; cv.height = 85;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = pg.bg || '#fff'; ctx.fillRect(0, 0, 60, 85);
  const src = bitmapCache.get(s0.photo) || s0.img;
  drawTransformed(ctx, src, 60, 85, s0.pan, s0.scale, s0.crop);
  const url = cv.toDataURL('image/jpeg', 0.6);
  thumbCache.set(i, { sig, url }); return url;
}

function renderThumbs() {
  const el = document.getElementById('thumbGrid');
  if (el.childElementCount !== S.pages.length) {
    el.innerHTML = '';
    S.pages.forEach((pg, i) => {
      const cs = Math.floor(i / 2);
      const d = document.createElement('div');
      d.className = 'thumb' + (cs === S.curSpread ? ' cur' : '');
      d.dataset.idx = i;
      const url = getThumb(pg, i);
      if (url) { const img = document.createElement('img'); img.src = url; d.appendChild(img); }
      else d.textContent = 'Empty';
      const pn = document.createElement('div'); pn.className = 'pgn'; pn.textContent = i + 1; d.appendChild(pn);
      d.onclick = () => { S.curSpread = cs; renderAll(); };
      el.appendChild(d);
    });
  } else {
    el.querySelectorAll('.thumb').forEach(d => {
      const i = parseInt(d.dataset.idx), cs = Math.floor(i / 2);
      d.classList.toggle('cur', cs === S.curSpread);
      const pg = S.pages[i], url = getThumb(pg, i);
      const img = d.querySelector('img');
      if (url) {
        if (img) img.src = url;
        else {
          const ni = document.createElement('img'); ni.src = url;
          d.textContent = ''; d.appendChild(ni);
          const pn = document.createElement('div'); pn.className = 'pgn'; pn.textContent = i + 1; d.appendChild(pn);
        }
      } else if (img) { img.remove(); }
    });
  }
}

let _lastPhotosLen = -1;
function renderImportList() {
  const el = document.getElementById('iList');
  if (el.childElementCount !== S.photos.length || _lastPhotosLen !== S.photos.length) {
    _lastPhotosLen = S.photos.length; el.innerHTML = '';
    S.photos.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'iitem' + (isUsed(p.url) ? ' used' : '');
      d.draggable = true; d.dataset.idx = i;
      d.ondragstart = e => e.dataTransfer.setData('pi', i);
      const grip = document.createElement('span'); grip.style.cssText = 'color:#555;user-select:none'; grip.textContent = '⠿';
      d.appendChild(grip);
      if (p.img) { const img = document.createElement('img'); img.className = 'ithumb'; img.src = p.url; d.appendChild(img); }
      const sp = document.createElement('span'); sp.title = p.name; sp.textContent = p.name; d.appendChild(sp);
      const del = document.createElement('button'); del.className = 'iitem-del'; del.title = 'Remove'; del.textContent = '×';
      del.onclick = e => { e.stopPropagation(); removeImportedPhoto(i); };
      d.appendChild(del); el.appendChild(d);
    });
  } else {
    el.querySelectorAll('.iitem').forEach(d => {
      const i = parseInt(d.dataset.idx); d.classList.toggle('used', isUsed(S.photos[i].url));
    });
  }
  document.getElementById('sb3').textContent = S.photos.length + ' photos';
}

let _lastBInfo = '';
function renderBInfo() {
  const n = totalPages(), sh = n / 4;
  const s = `${n}|${S.numLagen}|${S.blaetter}|${sh}`;
  if (s === _lastBInfo) return;
  _lastBInfo = s;
  const el = document.getElementById('bInfo');
  el.innerHTML = `<b style="color:var(--text2)">${n} pages</b><br>${S.numLagen} signatures × ${S.blaetter} sheets<br>= ${sh} A4 print sheets<br>Format: A6 (105×148.5mm)`;
}

function renderAll() {
  renderSpread();
  renderLageList();
  if (document.getElementById('t-thumbs').style.display !== 'none') renderThumbs();
  renderImportList();
  renderBInfo();
  document.getElementById('sb1').textContent = totalPages() + ' pages';
  document.getElementById('sb2').textContent = S.numLagen + ' sigs';
}

function updateControls(li, pgL, hasDbl) {
  [1, 2, 4, 6].forEach(x => {
    const b = document.getElementById('lb' + x);
    if (b) { b.classList.toggle('act', pgL.layout === x && !hasDbl); b.disabled = hasDbl; }
  });
  const [_ucli, _ucri] = spreadPages(S.curSpread);
  const isCover = _ucli < 0, isBack = _ucri < 0;
  const dblBtn = document.getElementById('lbDbl');
  dblBtn.disabled = isCover || isBack; dblBtn.classList.toggle('act', !!hasDbl);
  const note = document.getElementById('dblNote');
  if (!isCover && !isBack && hasDbl) {
    note.style.display = 'block';
    note.textContent = pgL.dbl && pgL.dbl.img ? '✓ Active' : 'Active , drop photo here';
  } else note.style.display = 'none';
  const bl = pgL.bl;
  ['blNone', 'blInner', 'blFull'].forEach(id => document.getElementById(id).classList.remove('act'));
  document.getElementById(!bl || bl === false ? 'blNone' : bl === 'inner' ? 'blInner' : 'blFull').classList.add('act');
  ['blScopeDbl', 'blScopeAll'].forEach(id =>
    document.getElementById(id).classList.toggle('act', id === (S.blScope === 'dbl' ? 'blScopeDbl' : 'blScopeAll'))
  );
  document.getElementById('marginRow').style.display = (bl && bl !== false && bl !== 'full') ? 'flex' : 'none';
}

function prevS() { if (S.curSpread > 0) { S.curSpread--; renderAll(); } }
function nextS() { if (S.curSpread < totalSpreads() - 1) { S.curSpread++; renderAll(); } }
function setTab(t) {
  ['lagen', 'thumbs'].forEach(x => {
    document.getElementById('t-' + x).style.display = x === t ? '' : 'none';
    document.getElementById('tb-' + x).classList.toggle('act', x === t);
  });
  if (t === 'thumbs') renderThumbs();
}

let _usedSet = null, _usedDirty = true;
function markUsedDirty() { _usedDirty = true; _usedSet = null; }
function buildUsedSet() {
  if (!_usedDirty && _usedSet) return _usedSet;
  _usedSet = new Set();
  S.pages.forEach(p => {
    p.slots.forEach(s => { if (s && s.photo) _usedSet.add(s.photo); });
    if (p.dbl && p.dbl.photo) _usedSet.add(p.dbl.photo);
  });
  _usedDirty = false; return _usedSet;
}
function isUsed(url) { return buildUsedSet().has(url); }

function slotClick(pi, si) {
  S.selPage = pi; S.selSlot = si; S.selDbl = false;
  const nu = S.photos.findIndex(p => !isUsed(p.url));
  if (nu >= 0) assignPhoto(pi, si, S.photos[nu]); else document.getElementById('fi').click();
}
function slotDrop(e, pi, si) {
  e.preventDefault();

  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files, pi, si, false);
    return;
  }

  const idx = parseInt(e.dataTransfer.getData('pi'));
  if (!isNaN(idx) && S.photos[idx]) assignPhoto(pi, si, S.photos[idx]);
}
function assignPhoto(pi, si, photo) {
  markUsedDirty();
  if (!S.pages[pi]) S.pages[pi] = mkPage();
  while (S.pages[pi].slots.length <= si) S.pages[pi].slots.push({});
  S.pages[pi].slots[si] = mkSlot(photo.url, photo.img);
  renderAll();
}
function toggleDouble() {
  markUsedDirty();
  const [li] = spreadPages(S.curSpread); if (li < 0) return; const pg = S.pages[li]; if (!pg) return;
  pg.dbl = pg.dbl ? null : { photo: null, img: null, pan: { x: 0, y: 0 }, scale: S.imgScale / 100, crop: null };
  renderAll();
}
function dblClick() {
  S.selDbl = true; S.selPage = null; S.selSlot = null;
  const nu = S.photos.findIndex(p => !isUsed(p.url));
  if (nu >= 0) assignDblPhoto(S.photos[nu]); else document.getElementById('fi').click();
}
function dblDrop(e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files, null, null, true);
    return;
  }
  const idx = parseInt(e.dataTransfer.getData('pi'));
  if (!isNaN(idx) && S.photos[idx]) assignDblPhoto(S.photos[idx]);
}
function assignDblPhoto(photo) {
  markUsedDirty();
  const [li] = spreadPages(S.curSpread); if (li < 0 || !S.pages[li] || !S.pages[li].dbl) return;

  S.pages[li].dbl = { photo: photo.url, img: photo.img, pan: { x: 0, y: 0 }, scale: S.imgScale / 100, crop: null };
  S.selDbl = false;
  renderAll();
}
function setLayout(n) {
  const [li, ri] = spreadPages(S.curSpread);
  [li, ri].filter(i => i >= 0).forEach(i => { if (S.pages[i]) S.pages[i].layout = n; });
  renderAll();
}
function setBg(c, el) {
  const [li, ri] = spreadPages(S.curSpread);
  [li, ri].forEach(i => {
    if (S.pages[i]) {
      S.pages[i].bg = c;
    }
  });
  document.querySelectorAll('.sw').forEach(s => s.classList.remove('act'));
  if (el) el.classList.add('act'); renderAll();
}
function blScope(s) { S.blScope = s; renderSpread(); }
function setBlMode(mode) {
  markUsedDirty();
  const [li, ri] = spreadPages(S.curSpread);
  const val = mode === 'none' ? false : mode;
  if (S.blScope === 'all') S.pages.forEach(p => { if (p) p.bl = val; });
  else[li, ri].filter(i => i >= 0).forEach(i => { if (S.pages[i]) S.pages[i].bl = val; });
  renderAll();
}

async function handleFiles(files, targetPage, targetSlot, targetDbl) {
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('image/')) continue;
    const url = await readFile(f);
    const img = await loadImg(url);
    const displayImg = await makeDisplayImg(img);

    const photo = { url, name: f.name, img: displayImg, fullImg: img };

    bitmapCache.set(url, displayImg);
    S.photos.push(photo);
    renderImportList();

    if (targetDbl != null) {
      assignDblPhoto(photo); targetDbl = null;
    } else if (targetPage != null && targetSlot != null) {
      assignPhoto(targetPage, targetSlot, photo); targetPage = null; targetSlot = null;
    } else if (S.selDbl) {
      assignDblPhoto(photo);
    } else if (S.selPage !== null && S.selSlot !== null) {
      assignPhoto(S.selPage, S.selSlot, photo);
      S.selPage = null; S.selSlot = null;
    }
  }
}
function readFile(f) {
  return new Promise(r => { const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsDataURL(f); });
}
function onDrop(e) {
  e.preventDefault();
  document.getElementById('dz').classList.remove('dov');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
}
function onDOv(e) { e.preventDefault(); document.getElementById('dz').classList.add('dov'); }
function onDLv() { document.getElementById('dz').classList.remove('dov'); }

function removeImportedPhoto(idx) {
  markUsedDirty();
  const url = S.photos[idx].url;
  bitmapCache.delete(url);
  S.pages.forEach(p => {
    p.slots = p.slots.map(s => s && s.photo === url ? {} : s);
    if (p.dbl && p.dbl.photo === url) p.dbl = { photo: null, img: null, pan: { x: 0, y: 0 }, scale: 1, crop: null };
  });
  S.photos.splice(idx, 1);
  thumbCache.clear(); _lastPhotosLen = -1; renderAll();
}

function autoFill() {
  markUsedDirty(); let pi = 0;
  for (let pg = 0; pg < S.pages.length && pi < S.photos.length; pg++) {
    const p = S.pages[pg];
    if (p.dbl && !p.dbl.photo && pi < S.photos.length) {
      p.dbl = { photo: S.photos[pi].url, img: S.photos[pi].img, pan: { x: 0, y: 0 }, scale: S.imgScale / 100, crop: null };
      pi++;
    }
    const n = slotGeom(p.layout || 1, 1, 1, p.bl, null, 1).length;
    for (let si = 0; si < n && pi < S.photos.length; si++) {
      if (!p.slots[si] || !p.slots[si].photo) {
        while (p.slots.length <= si) p.slots.push({});
        p.slots[si] = mkSlot(S.photos[pi].url, S.photos[pi].img);
        getBitmap(S.photos[pi]);
        pi++;
      }
    }
  }
  renderAll();
}

function clearAll() {
  if (!confirm('Clear all photo assignments?')) return;
  markUsedDirty();
  S.pages.forEach((p, pi) => {
    p.slots = []; if (p.dbl) p.dbl = { photo: null, img: null, pan: { x: 0, y: 0 }, scale: 1, crop: null };
  });
  thumbCache.clear(); renderAll();
}

function buildImposition() {
  const N = S.blaetter * 4, A = S.blaetter / 2, pdfPages = [];
  for (let lage = 0; lage < S.numLagen; lage++) {
    const lS = lage * N;
    for (let a = 0; a < A; a++) {
      const front = [], back = [];
      for (let s = 0; s < 2; s++) {
        const y = s === 0 ? 0 : PDF_H;
        const k = a + s * A;
        const fr = 2 * k + 1, fl = N - 2 * k, bl2 = 2 * k + 2, br = N - 2 * k - 1;
        front.push({ x: 0, y, pageIdx: lS + fl - 1 });
        front.push({ x: 105, y, pageIdx: lS + fr - 1 });
        back.push({ x: 0, y, pageIdx: lS + bl2 - 1 });
        back.push({ x: 105, y, pageIdx: lS + br - 1 });
      }
      pdfPages.push({ slots: front, lage: lage + 1, sheet: a + 1, side: 'Front' });
      pdfPages.push({ slots: back, lage: lage + 1, sheet: a + 1, side: 'Back' });
    }
  }
  return pdfPages;
}

function showPrintModal() { document.getElementById('pModal').style.display = 'flex'; }

async function drawDblHalfPDF(doc, pgLeft, ox, oy, W, H, half) {
  if (!pgLeft || !pgLeft.dbl || !pgLeft.dbl.img) return;
  const dbl = pgLeft.dbl;
  const blMode = pgLeft.bl;
  const full = (blMode === true || blMode === 'full');
  const p = full ? 0 : S.margin;
  const sc = 11.81;

  const rgb = hexRgb(pgLeft.bg || '#fff');
  doc.setFillColor(rgb.r, rgb.g, rgb.b); doc.rect(ox, oy, W, H, 'F');

  const rawSrc = getFullImg(dbl.photo) || dbl.img;
  const src = await waitForImg(rawSrc) || rawSrc;
  if (!src) return;

  const cvW = Math.round(2 * W * sc);
  const cvH = Math.round(H * sc);
  const ppx = Math.round(p * sc);
  const imgW = cvW - ppx * 2;
  const imgH = cvH - ppx * 2;

  if (!_dblTmpCv) _dblTmpCv = document.createElement('canvas');
  _dblTmpCv.width = cvW; _dblTmpCv.height = cvH;
  const ctx = _dblTmpCv.getContext('2d');

  ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`; ctx.fillRect(0, 0, cvW, cvH);

  if (imgW > 0 && imgH > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ppx, ppx, imgW, imgH);
    ctx.clip();
    ctx.translate(ppx, ppx);
    drawTransformed(ctx, src, imgW, imgH, dbl.pan, dbl.scale, dbl.crop);
    ctx.restore();
  }

  const halfPx = Math.round(W * sc);
  const srcX = half === 'right' ? halfPx : 0;

  const halfCv = document.createElement('canvas');
  halfCv.width = halfPx; halfCv.height = cvH;
  halfCv.getContext('2d').drawImage(_dblTmpCv, srcX, 0, halfPx, cvH, 0, 0, halfPx, cvH);

  try {
    doc.addImage(halfCv.toDataURL('image/jpeg', 0.92), 'JPEG', ox, oy, W, H, '', 'FAST');
  } catch (e) { }
}

let _progEl = null;
function _showProgress(msg) {
  if (!_progEl) {
    _progEl = document.createElement('div');
    _progEl.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,.75)',
      'z-index:500;display:flex;flex-direction:column',
      'align-items:center;justify-content:center;gap:14px'
    ].join(';');
    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e1e;border:1px solid #3a3a3a;border-radius:8px;padding:24px 32px;min-width:280px;text-align:center';
    const title = document.createElement('div');
    title.id = '_progTitle';
    title.style.cssText = 'font-size:13px;color:#d0d0d0;margin-bottom:12px;font-weight:600';
    title.textContent = 'Creating PDF...';
    const track = document.createElement('div');
    track.style.cssText = 'background:#333;border-radius:4px;height:6px;overflow:hidden';
    const bar = document.createElement('div');
    bar.id = '_progBar';
    bar.style.cssText = 'height:100%;width:0%;background:#9333ea;border-radius:4px;transition:width .15s';
    track.appendChild(bar);
    const label = document.createElement('div');
    label.id = '_progLabel';
    label.style.cssText = 'font-size:11px;color:#666;margin-top:8px';
    box.appendChild(title); box.appendChild(track); box.appendChild(label);
    _progEl.appendChild(box);
    document.body.appendChild(_progEl);
  }
  _progEl.style.display = 'flex';
  document.getElementById('_progLabel').textContent = msg || '';
  document.getElementById('_progBar').style.width = '0%';
}
function _updateProgress(pct, msg) {
  if (!_progEl) return;
  document.getElementById('_progBar').style.width = pct + '%';
  if (msg) document.getElementById('_progLabel').textContent = msg;
}
function _hideProgress() {
  if (_progEl) _progEl.style.display = 'none';
}

const _pdfCv = document.createElement('canvas');
let _dblTmpCv = null;

async function exportPDF() {
  document.getElementById('pModal').style.display = 'none';
  const { jsPDF } = window.jspdf; const n = totalPages();
  const optCut = document.getElementById('optCutlines').checked;
  const optPN = document.getElementById('optPageNums').checked;
  const optLabel = document.getElementById('optSheetLabel').checked;
  const optMarks = document.getElementById('optCutmarks').checked;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pages = buildImposition();
  const total = pages.length;

  _showProgress('Preparing...');
  await new Promise(r => setTimeout(r, 50));

  for (let pi = 0; pi < pages.length; pi++) {
    _updateProgress(Math.round((pi / total) * 90), `Page ${pi + 1} of ${total}`);
    await new Promise(r => setTimeout(r, 0));
    if (pi > 0) doc.addPage([210, 297], 'portrait');
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 297, 'F');
    const { slots, lage, sheet, side } = pages[pi];

    for (const slot of slots) {
      const idx = slot.pageIdx; if (idx < 0 || idx >= n) continue;
      const pg = S.pages[idx] || mkPage();

      const dblOwner = slot.x === 0 ? pg : (S.pages[idx % 2 === 0 ? idx - 1 : idx + 1] || null);
      const isDblPage = !!(dblOwner && dblOwner.dbl && dblOwner.dbl.img);
      if (isDblPage) {

        const half = slot.x === 0 ? 'left' : 'right';
        await drawDblHalfPDF(doc, dblOwner, slot.x, slot.y, A6W, PDF_H, half);
      } else {
        await drawPagePDF(doc, pg, slot.x, slot.y, A6W, PDF_H, slot.x === 0 ? 'right' : 'left');
      }
      if (optPN) {
        doc.setFontSize(4.5); doc.setTextColor(170, 170, 170);
        doc.text('p.' + (idx + 1), slot.x + 0.8, slot.y + PDF_H - 0.8);
      }
    }

    if (optCut) {
      doc.setDrawColor(155, 155, 155); doc.setLineWidth(0.15);
      try { doc.setLineDashPattern([1.2, 1.2], 0); } catch (e) { }
      doc.line(0, PDF_H, 210, PDF_H); doc.line(105, 0, 105, 297);
      try { doc.setLineDashPattern([], 0); } catch (e) { }
    }
    if (optMarks) {
      doc.setDrawColor(130, 130, 130); doc.setLineWidth(0.1); const ml = 3;
      [[0, 0], [105, 0], [0, PDF_H], [105, PDF_H]].forEach(([sx, sy]) => {
        doc.line(sx - ml, sy, sx, sy); doc.line(sx, sy - ml, sx, sy);
        doc.line(sx + A6W, sy, sx + A6W + ml, sy); doc.line(sx + A6W, sy - ml, sx + A6W, sy);
        doc.line(sx - ml, sy + PDF_H, sx, sy + PDF_H); doc.line(sx, sy + PDF_H, sx, sy + PDF_H + ml);
        doc.line(sx + A6W, sy + PDF_H, sx + A6W + ml, sy + PDF_H); doc.line(sx + A6W, sy + PDF_H, sx + A6W, sy + PDF_H + ml);
      });
    }
    if (optLabel) {
      doc.setFontSize(4.5); doc.setTextColor(185, 185, 185);
      doc.text(`Sig. ${lage} · Sheet ${sheet} · ${side}`, 105, 296.2, { align: 'center' });
    }
  }
  _updateProgress(98, 'Saving...');
  await new Promise(r => setTimeout(r, 50));
  doc.save('photobook.pdf');
  _hideProgress();
}

async function drawPagePDF(doc, pg, ox, oy, W, H, innerEdge) {
  const rgb = hexRgb(pg.bg);
  doc.setFillColor(rgb.r, rgb.g, rgb.b); doc.rect(ox, oy, W, H, 'F');
  const slots = slotGeom(pg.layout || 1, W, H, pg.bl, innerEdge, 1);
  for (let si = 0; si < slots.length; si++) {
    const sl = slots[si], sd = pg.slots[si];
    if (sd && sd.img) {
      const sc = 11.81, cw = Math.round(sl.w * sc), ch = Math.round(sl.h * sc);
      _pdfCv.width = cw; _pdfCv.height = ch;
      const ctx = _pdfCv.getContext('2d');
      ctx.clearRect(0, 0, cw, ch);
      const _rgb = hexRgb(pg.bg);
      ctx.fillStyle = `rgb(${_rgb.r},${_rgb.g},${_rgb.b})`; ctx.fillRect(0, 0, cw, ch);
      const rawSrc = getFullImg(sd.photo) || sd.img;
      const src = await waitForImg(rawSrc) || rawSrc;
      drawTransformed(ctx, src, cw, ch, sd.pan, sd.scale, sd.crop);
      try { doc.addImage(_pdfCv.toDataURL('image/jpeg', 0.92), 'JPEG', ox + sl.x, oy + sl.y, sl.w, sl.h, '', 'FAST'); } catch (e) { }
    }

  }
}

function getFullImg(url) {
  const photo = S.photos.find(p => p.url === url);
  if (!photo) return null;

  const img = photo.fullImg || photo.img;
  if (!img) return null;

  if (img instanceof ImageBitmap) return photo.fullImg || null;
  return img;
}

function waitForImg(img) {
  if (!img) return Promise.resolve(null);
  if (img instanceof ImageBitmap) return Promise.resolve(img);
  if (img.complete && img.naturalWidth > 0) return Promise.resolve(img);
  return new Promise(r => {
    img.onload = () => r(img);
    img.onerror = () => r(null);
  });
}

function hexRgb(h) {
  h = (h || '#fff').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
}

function saveProject() {

  const data = {
    version: 1,
    numLagen: S.numLagen,
    blaetter: S.blaetter,
    curSpread: S.curSpread,
    margin: S.margin,
    imgScale: S.imgScale,
    blScope: S.blScope,
    photos: S.photos.map(p => ({ url: p.url, name: p.name })),
    pages: S.pages.map(pg => ({
      bg: pg.bg,
      layout: pg.layout,
      bl: pg.bl,
      slots: pg.slots.map(s => s && s.photo ? {
        photo: s.photo,
        pan: s.pan,
        scale: s.scale,
        crop: s.crop
      } : null),
      dbl: pg.dbl ? {
        photo: pg.dbl.photo,
        pan: pg.dbl.pan,
        scale: pg.dbl.scale,
        crop: pg.dbl.crop
      } : null
    }))
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'photobook-project.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.photos || !data.pages) {
        alert('Invalid project file.');
        return;
      }
      await _applyProject(data);
    } catch (err) {
      alert('Could not load project: ' + err.message);
    }
  };
  input.click();
}

async function _applyProject(data) {

  bitmapCache.clear();
  thumbCache.clear();
  S.photos = [];
  _lastPhotosLen = -1;
  _lastLageCount = -1;

  S.numLagen = data.numLagen;
  S.blaetter = data.blaetter;
  S.curSpread = data.curSpread || 0;
  S.margin = data.margin ?? 3;
  S.imgScale = data.imgScale ?? 100;
  S.blScope = data.blScope || 'dbl';

  document.getElementById('iLagen').value = S.numLagen;
  document.getElementById('iBlaetter').value = S.blaetter;
  document.getElementById('marginSlider').value = S.margin;
  document.getElementById('marginVal').textContent = S.margin + ' mm';
  document.getElementById('imgScaleSlider').value = S.imgScale;
  document.getElementById('imgScaleVal').textContent = S.imgScale + '%';

  const photoMap = new Map();
  for (const p of data.photos) {
    const img = await loadImg(p.url);
    if (!img) continue;
    const displayImg = await makeDisplayImg(img);
    const photo = { url: p.url, name: p.name, img: displayImg, fullImg: img };
    bitmapCache.set(p.url, displayImg);
    S.photos.push(photo);
    photoMap.set(p.url, photo);
  }

  S.pages = data.pages.map(pg => {
    const page = mkPage();
    page.bg = pg.bg || '#fff';
    page.layout = pg.layout || 1;
    page.bl = pg.bl ?? false;
    page.slots = (pg.slots || []).map(s => {
      if (!s || !s.photo) return {};
      const photo = photoMap.get(s.photo);
      if (!photo) return {};
      return { photo: s.photo, img: photo.img, pan: s.pan || { x: 0, y: 0 }, scale: s.scale ?? 1, crop: s.crop || null };
    });
    if (pg.dbl && pg.dbl.photo) {
      const photo = photoMap.get(pg.dbl.photo);
      page.dbl = {
        photo: pg.dbl.photo,
        img: photo ? photo.img : null,
        pan: pg.dbl.pan || { x: 0, y: 0 },
        scale: pg.dbl.scale ?? 1,
        crop: pg.dbl.crop || null
      };
    }
    return page;
  });

  const n = totalPages();
  while (S.pages.length < n) S.pages.push(mkPage());
  S.pages = S.pages.slice(0, n);

  S.curSpread = clamp(S.curSpread, 0, totalSpreads() - 1);
  markUsedDirty();
  renderAll();
}

rebuildBook();
