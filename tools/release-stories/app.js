/* Release Story Generator — Milk & Honey */

const CANVAS_W = 1080;
const CANVAS_H = 1920;

const ROLES = [
  'written',
  'co-written',
  'produced',
  'co-produced',
  'executive produced',
  'mixed',
  'vocal production',
  'custom',
];

// Display text for each role when building the credit label
const ROLE_LABELS = {
  'written': 'WRITTEN',
  'co-written': 'CO WRITTEN',
  'produced': 'PRODUCED',
  'co-produced': 'CO PRODUCED',
  'executive produced': 'EXECUTIVE PRODUCED',
  'mixed': 'MIXED',
  'vocal production': 'VOCAL PRODUCTION',
};

const state = {
  artwork: null,        // HTMLImageElement
  title: '',
  artist: '',
  creditEnabled: false,
  roles: [],
  customRole: '',
  tracks: [],
  creditNames: '',
  logo: 'mh',           // 'mh' | 'mhr'
  accent: '#c0392b',
  swatches: [],
  roster: [],
};

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');

const logos = { mh: new Image(), mhr: new Image() };
logos.mh.src = 'assets/mh.png';
logos.mhr.src = 'assets/mh-records.png';

/* ---------------- Spotify fetch ---------------- */

async function fetchSpotify() {
  const url = $('spotifyUrl').value.trim();
  const status = $('fetchStatus');
  if (!url.includes('open.spotify.com')) {
    status.textContent = 'That does not look like a Spotify link.';
    return;
  }
  status.textContent = 'Fetching…';

  try {
    const res = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url));
    if (!res.ok) throw new Error('oEmbed HTTP ' + res.status);
    const data = await res.json();

    if (data.title && !$('titleInput').value) {
      $('titleInput').value = data.title;
      state.title = data.title;
    }

    // Upgrade 300px thumbnail to the 640px original
    let artUrl = data.thumbnail_url || '';
    artUrl = artUrl.replace('ab67616d00001e02', 'ab67616d0000b273');

    await loadArtwork(artUrl);
    status.textContent = 'Artwork loaded ✓';
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not fetch from Spotify — try uploading the artwork manually.';
  }
}

function loadArtwork(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      state.artwork = img;
      extractSwatches(img);
      render();
      resolve();
    };
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------------- Color extraction ---------------- */

function extractSwatches(img) {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, s, s);
  let data;
  try {
    data = cx.getImageData(0, 0, s, s).data;
  } catch (e) {
    console.warn('Canvas tainted; skipping color extraction', e);
    return;
  }

  // Score hue buckets by saturation & mid lightness
  const buckets = new Map(); // bucket -> {score, r, g, b, n}
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, sat, l] = rgbToHsl(r, g, b);
    if (sat < 0.18 || l < 0.12 || l > 0.9) continue;
    const bucket = Math.round(h / 15) % 24;
    const score = sat * (1 - Math.abs(l - 0.5));
    const cur = buckets.get(bucket) || { score: 0, r: 0, g: 0, b: 0, n: 0 };
    cur.score += score;
    cur.r += r; cur.g += g; cur.b += b; cur.n++;
    buckets.set(bucket, cur);
  }

  const sorted = [...buckets.values()].sort((a, b) => b.score - a.score).slice(0, 4);
  state.swatches = sorted.map(v => {
    let r = v.r / v.n, g = v.g / v.n, b = v.b / v.n;
    // Nudge toward a usable accent: bump saturation a little
    const [h, s2, l] = rgbToHsl(r, g, b);
    [r, g, b] = hslToRgb(h, Math.min(1, s2 * 1.25), Math.min(0.62, Math.max(0.38, l)));
    return rgbToHex(r, g, b);
  });

  if (state.swatches.length) {
    state.accent = state.swatches[0];
    $('accentPicker').value = state.accent;
  }
  renderSwatches();
}

function renderSwatches() {
  const wrap = $('swatches');
  wrap.innerHTML = '';
  state.swatches.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'swatch' + (hex === state.accent ? ' active' : '');
    b.style.background = hex;
    b.title = hex;
    b.onclick = () => {
      state.accent = hex;
      $('accentPicker').value = hex;
      renderSwatches();
      render();
    };
    wrap.appendChild(b);
  });
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function lighten(hex, targetL) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h, s * 0.75, targetL);
  return rgbToHex(r2, g2, b2);
}

/* ---------------- Client roster & bold segments ---------------- */

function extractSheetCsvUrl(url) {
  // Accept a normal share link or a publish-to-web link; build a CSV export URL
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/(?:e\/)?([\w-]+)/);
  if (!m) return null;
  if (url.includes('/d/e/')) {
    // published-to-web id
    return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv`;
  }
  // /export gives clean, spec-compliant CSV (gviz mangles rich sheets)
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

// Proper CSV parse — handles quoted fields with embedded commas and newlines
// (the roster's Bio column is full of both). Returns an array of rows.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function loadRoster() {
  const url = $('sheetUrl').value.trim();
  const status = $('rosterStatus');
  const csvUrl = extractSheetCsvUrl(url);
  if (!csvUrl) {
    status.textContent = 'Not a Google Sheets link.';
    return;
  }
  status.textContent = 'Loading…';
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    let names = rows.map(r => (r[0] || '').trim()).filter(Boolean);
    // Drop the header cell if present
    if (names.length && /^(name|names|client|clients|artist|roster)$/i.test(names[0])) {
      names = names.slice(1);
    }
    if (!names.length) throw new Error('No names found in first column');
    state.roster = names;
    localStorage.setItem('mh_sheet_url', url);
    localStorage.setItem('mh_roster', JSON.stringify(names));
    status.textContent = `${names.length} clients loaded ✓`;
    renderRosterList();
    render();
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not load — make sure the sheet is shared as "anyone with the link can view".';
  }
}

// Inside the Milk & Honey dashboard the roster comes from the dashboard's own
// client list (same site, same login) — no sheet link needed. Names like
// "Alexis Kesselman (Idarose)" also match as "Alexis Kesselman" and "Idarose".
async function loadDashboardRoster() {
  try {
    const res = await fetch('/api/sheets', { credentials: 'same-origin' });
    if (!res.ok) return false;
    const data = await res.json();
    const names = [];
    for (const c of data.clients || []) {
      const n = String(c.name || '').trim();
      if (!n) continue;
      names.push(n);
      const m = n.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      if (m) names.push(m[1].trim(), m[2].trim());
    }
    const uniq = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!uniq.length) return false;
    state.roster = uniq;
    state.clients = (data.clients || []).map(c => ({ name: c.name, types: c.types || [] }));
    $('rosterStatus').textContent = `${(data.clients || []).length} clients from the dashboard ✓`;
    // The sheet-link fields aren't needed here.
    ['sheetUrl', 'loadRosterBtn'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    const lbl = document.querySelector('label[for="sheetUrl"]'); if (lbl) lbl.style.display = 'none';
    renderRosterList();
    render();
    return true;
  } catch (e) { return false; }
}

function renderRosterList() {
  $('rosterList').textContent = state.roster.join(' · ');
}

/*
 * Split text into {text, bold} segments.
 * - *name* forces bold, _name_ forces regular
 * - roster names are bolded only on mixed releases (client + non-client present)
 */
function parseSegments(text) {
  // 1) Manual markers take priority
  const manual = [];
  const re = /\*([^*]+)\*|_([^_]+)_/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) manual.push({ text: text.slice(last, m.index), bold: null });
    if (m[1] !== undefined) manual.push({ text: m[1], bold: true });
    else manual.push({ text: m[2], bold: false });
    last = m.index + m[0].length;
  }
  if (last < text.length) manual.push({ text: text.slice(last), bold: null });

  // 2) Roster matching on unmarked segments
  const out = [];
  for (const seg of manual) {
    if (seg.bold !== null) { out.push(seg); continue; }
    out.push(...rosterSplit(seg.text));
  }

  // 3) Only keep roster bolding if the full line is "mixed"
  const boldText = out.filter(s => s.bold).map(s => s.text).join('');
  const rest = out.filter(s => !s.bold).map(s => s.text).join('')
    .replace(/\b(feat|ft|with|x|vs|and)\.?\b/gi, '')
    .replace(/[,&+\/•()\s]/g, '');
  const hasManualBold = /\*[^*]+\*/.test(text);
  if (!hasManualBold && boldText && !rest) {
    return [{ text: out.map(s => s.text).join(''), bold: false }];
  }
  return out.filter(s => s.text.length);
}

function rosterSplit(text) {
  if (!state.roster.length || !text) return [{ text, bold: false }];
  const segs = [{ text, bold: false }];
  for (const name of state.roster) {
    if (!name) continue;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.bold) continue;
      const idx = seg.text.toLowerCase().indexOf(name.toLowerCase());
      if (idx === -1) continue;
      const before = seg.text.slice(0, idx);
      const match = seg.text.slice(idx, idx + name.length);
      const after = seg.text.slice(idx + name.length);
      const repl = [];
      if (before) repl.push({ text: before, bold: false });
      repl.push({ text: match, bold: true });
      if (after) repl.push({ text: after, bold: false });
      segs.splice(i, 1, ...repl);
      i += repl.length - 1;
    }
  }
  return segs;
}

/* ---------------- Credit label ---------------- */

function buildCreditLabel() {
  if (state.customRole.trim()) return state.customRole.trim().toUpperCase();
  const parts = state.roles
    .filter(r => r !== 'custom')
    .map(r => ROLE_LABELS[r]);
  if (!parts.length) return '';
  const rolesText = parts.length > 1
    ? parts.slice(0, -1).join(', ') + ' & ' + parts[parts.length - 1]
    : parts[0];

  // Optional prefix: only the specific track titles, if any were listed.
  const tracks = state.tracks.map(t => t.trim()).filter(Boolean);
  let prefix = '';
  if (tracks.length) {
    const q = tracks.map(t => `"${t.toUpperCase()}"`);
    prefix = q.length > 1
      ? q.slice(0, -1).join(', ') + ' & ' + q[q.length - 1]
      : q[0];
  }
  return (prefix ? prefix + ' ' : '') + rolesText + ' BY';
}

/* ---------------- Canvas rendering ---------------- */

let fontsReady = false;
async function ensureFonts() {
  if (fontsReady) return;
  await Promise.all([
    document.fonts.load('400 50px Switzer'),
    document.fonts.load('500 50px Switzer'),
    document.fonts.load('600 50px Switzer'),
    document.fonts.load('900 50px Switzer'),
  ]);
  fontsReady = true;
}

// Separable box blur, run 3× to approximate a gaussian. Pure JS so it renders
// identically in Safari and Chrome (canvas ctx.filter is unreliable in Safari).
function boxBlurH(src, w, h, r) {
  const out = new Uint8ClampedArray(src.length);
  const span = r + r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let rs = 0, gs = 0, bs = 0;
    for (let i = -r; i <= r; i++) {
      const xx = Math.min(w - 1, Math.max(0, i));
      const p = row + xx * 4;
      rs += src[p]; gs += src[p + 1]; bs += src[p + 2];
    }
    for (let x = 0; x < w; x++) {
      const o = row + x * 4;
      out[o] = rs / span; out[o + 1] = gs / span; out[o + 2] = bs / span; out[o + 3] = 255;
      const pa = row + Math.min(w - 1, x + r + 1) * 4;
      const ps = row + Math.max(0, x - r) * 4;
      rs += src[pa] - src[ps]; gs += src[pa + 1] - src[ps + 1]; bs += src[pa + 2] - src[ps + 2];
    }
  }
  src.set(out);
}
function boxBlurV(src, w, h, r) {
  const out = new Uint8ClampedArray(src.length);
  const span = r + r + 1;
  for (let x = 0; x < w; x++) {
    const col = x * 4;
    let rs = 0, gs = 0, bs = 0;
    for (let i = -r; i <= r; i++) {
      const yy = Math.min(h - 1, Math.max(0, i));
      const p = col + yy * w * 4;
      rs += src[p]; gs += src[p + 1]; bs += src[p + 2];
    }
    for (let y = 0; y < h; y++) {
      const o = col + y * w * 4;
      out[o] = rs / span; out[o + 1] = gs / span; out[o + 2] = bs / span; out[o + 3] = 255;
      const pa = col + Math.min(h - 1, y + r + 1) * w * 4;
      const ps = col + Math.max(0, y - r) * w * 4;
      rs += src[pa] - src[ps]; gs += src[pa + 1] - src[ps + 1]; bs += src[pa + 2] - src[ps + 2];
    }
  }
  src.set(out);
}
function gaussianBlur(data, w, h, r) {
  for (let i = 0; i < 3; i++) { boxBlurH(data, w, h, r); boxBlurV(data, w, h, r); }
}

function drawBackground() {
  if (state.artwork) {
    const img = state.artwork;
    // Scale so the artwork's HEIGHT fills 1920 (square art → 1920 wide, cropped at the sides)
    const scale = CANVAS_H / img.height;
    const w = img.width * scale, h = img.height * scale;
    const x = (CANVAS_W - w) / 2, y = (CANVAS_H - h) / 2;

    // Blur at quarter resolution for speed, then upscale smoothly
    const ds = 0.25;
    const ow = Math.round(CANVAS_W * ds), oh = Math.round(CANVAS_H * ds);
    const off = document.createElement('canvas');
    off.width = ow; off.height = oh;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.drawImage(img, x * ds, y * ds, w * ds, h * ds);
    try {
      const id = octx.getImageData(0, 0, ow, oh);
      gaussianBlur(id.data, ow, oh, 14);
      octx.putImageData(id, 0, 0);
    } catch (e) {
      console.warn('Blur skipped (tainted canvas)', e);
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Dim so white text always reads
  ctx.fillStyle = 'rgba(10, 10, 10, 0.22)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Top-right color glow: bright tint pulled from the artwork, "lighten"-style shine
  if (state.artwork) {
    const glow = lighten(state.accent, 0.72);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const gx = CANVAS_W * 0.60, gy = CANVAS_H * 0.10;
    const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, CANVAS_W * 0.95);
    const [r, g, b] = hexToRgb(glow);
    gr.addColorStop(0, `rgba(${r|0},${g|0},${b|0},0.55)`);
    gr.addColorStop(0.35, `rgba(${r|0},${g|0},${b|0},0.22)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }

  // Gentle top/bottom vignette
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, 'rgba(0,0,0,0.14)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0)');
  grad.addColorStop(0.78, 'rgba(0,0,0,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawSpacedText(text, cx, y, font, color, spacing) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const widths = [...text].map(ch => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
}

function spacedWidth(text, spacing) {
  const widths = [...text].map(ch => ctx.measureText(ch).width);
  return widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
}

// Letter-spaced text that wraps to fit maxWidth, each line centered
function drawWrappedSpacedText(text, cx, y, font, color, spacing, maxWidth, lineHeight) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (spacedWidth(test, spacing) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((ln, i) => drawSpacedText(ln, cx, y + i * lineHeight, font, color, spacing));
  return y + (lines.length - 1) * lineHeight;
}

// boldWeight lets callers choose the weight for bold segments:
// 900 (Black) for the title, 600 (Semibold) for distinguishing client names.
function fontFor(bold, size, boldWeight = 900) {
  return `${bold ? boldWeight : 400} ${size}px Switzer`;
}

// Wrap segments into lines that fit maxWidth; returns array of lines (arrays of segments)
function wrapSegments(segments, size, maxWidth, boldWeight = 900) {
  const words = [];
  segments.forEach(seg => {
    seg.text.split(/(\s+)/).forEach(part => {
      if (part) words.push({ text: part, bold: seg.bold });
    });
  });

  const lines = [];
  let line = [], lineW = 0;
  for (const w of words) {
    ctx.font = fontFor(w.bold, size, boldWeight);
    const ww = ctx.measureText(w.text).width;
    if (lineW + ww > maxWidth && line.length) {
      // Trim trailing whitespace word
      while (line.length && !line[line.length - 1].text.trim()) line.pop();
      lines.push(line);
      line = [];
      lineW = 0;
      if (!w.text.trim()) continue;
    }
    line.push(w);
    lineW += ww;
  }
  while (line.length && !line[line.length - 1].text.trim()) line.pop();
  if (line.length) lines.push(line);
  return lines;
}

function drawSegmentLines(lines, cx, y, size, color, lineHeight, boldWeight = 900) {
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  for (const line of lines) {
    let total = 0;
    for (const w of line) {
      ctx.font = fontFor(w.bold, size, boldWeight);
      total += ctx.measureText(w.text).width;
    }
    let x = cx - total / 2;
    for (const w of line) {
      ctx.font = fontFor(w.bold, size, boldWeight);
      ctx.fillText(w.text, x, y);
      x += ctx.measureText(w.text).width;
    }
    y += lineHeight;
  }
  return y - lineHeight; // baseline of last line
}

async function render() {
  await ensureFonts();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();

  const cx = CANVAS_W / 2;
  const maxTextW = 920;

  // PSD point sizes → pixels (PSD authored at ~2× / 144dpi, so 1pt ≈ 2px).
  // Tracking is Photoshop units (1/1000 em): px gap = tracking/1000 * fontPx.
  const PT = (n) => n * 2;
  const TRACK = (tracking, sizePt) => (tracking / 1000) * PT(sizePt);

  // Divider + credit text share one color pulled from the artwork
  const creditColor = lighten(state.accent, 0.80);

  // Header — Switzer Regular 25, tracking -50
  let y = 300;
  drawSpacedText('NEW RELEASE', cx, y, `400 ${PT(25)}px Switzer`, '#ffffff', TRACK(-50, 25));

  // Divider — same color as credit text
  y += 34;
  ctx.fillStyle = creditColor;
  ctx.fillRect(cx - 150, y, 300, 3);

  // Title — Switzer Black 25, regular tracking
  y += 78;
  const titleLines = wrapSegments([{ text: state.title || 'Release Title', bold: true }], PT(25), maxTextW);
  y = drawSegmentLines(titleLines, cx, y, PT(25), '#ffffff', 62);

  // Artist — Switzer Regular 25; client names bolded to Semibold (600) to
  // distinguish them from non-client artists on a mixed release.
  y += 74;
  const artistSegs = parseSegments(state.artist || 'Artist Name');
  const artistLines = wrapSegments(artistSegs, PT(25), maxTextW, 600);
  y = drawSegmentLines(artistLines, cx, y, PT(25), '#ffffff', 64, 600);

  // Artwork
  const artSize = 620;
  const artTop = Math.max(y + 70, state.creditEnabled ? 560 : 650);
  if (state.artwork) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 18;
    ctx.drawImage(state.artwork, cx - artSize / 2, artTop, artSize, artSize);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(cx - artSize / 2, artTop, artSize, artSize);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '500 30px Switzer';
    ctx.textAlign = 'center';
    ctx.fillText('Paste a Spotify link to load artwork', cx, artTop + artSize / 2);
    ctx.textAlign = 'start';
  }

  // Credit block
  if (state.creditEnabled) {
    const label = buildCreditLabel();
    let cy = artTop + artSize + 92;
    if (label) {
      // Credit text — Switzer Regular 12, regular tracking
      drawWrappedSpacedText(label, cx, cy, `400 ${PT(12)}px Switzer`, creditColor, 0, maxTextW, 32);
      cy += 60;
    }
    if (state.creditNames.trim()) {
      // Credited client(s) — always Switzer Regular, never bolded: everyone on
      // the bottom credit is a client, so there's no non-client to distinguish.
      const lines = wrapSegments([{ text: state.creditNames, bold: false }], PT(25), maxTextW);
      drawSegmentLines(lines, cx, cy, PT(25), '#ffffff', 64);
    }
  }

  // Logo
  const logo = logos[state.logo];
  if (logo.complete && logo.naturalWidth) {
    const lw = 310;
    const lh = lw * (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, cx - lw / 2, 1600 - lh / 2, lw, lh);
  }
}

/* ---------------- Download ---------------- */

function download() {
  render().then(() => {
    canvas.toBlob(blob => {
      if (!blob) {
        alert('Export failed — if artwork came from Spotify, try re-fetching, or upload the image manually.');
        return;
      }
      const a = document.createElement('a');
      const name = [state.artist, state.title, 'story']
        .filter(Boolean).join(' - ')
        .replace(/[^\w\s&.-]/g, '').replace(/\s+/g, '-');
      a.download = (name || 'release-story') + '.png';
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  });
}

/* ---------------- Batch mode: parse email thread ---------------- */

// Detect roles in a credit phrase, returned in the order they appear.
// Compound roles are matched (and masked) first so "produced"/"written"
// inside "co-produced"/"co-written" aren't double-counted.
function detectRoles(text) {
  let t = ' ' + text.toLowerCase() + ' ';
  const found = [];
  const grab = (key, re) => {
    const m = re.exec(t);
    if (m) {
      found.push({ key, idx: m.index });
      t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length);
    }
  };
  grab('executive produced', /\bexecutive produced\b/);
  grab('co-produced', /\bco[-\s]produced\b/);
  grab('co-written', /\bco[-\s]written\b/);
  grab('vocal production', /\bvocal produc(?:tion|ed)\b/);
  grab('produced', /\bproduced\b/);
  grab('written', /\bwritten\b/);
  grab('mixed', /\bmix(?:ed)?\b/);
  return found.sort((a, b) => a.idx - b.idx).map(f => f.key);
}

function looksLikeMHRecords(text) {
  return /milk\s*&?\s*(?:and\s*)?honey\s+records|m\s*&?\s*h\s+records/i.test(text);
}

// Does this line look like an "Artist - Title" or "Artist \"Title\"" release line,
// as opposed to a label line ("Flyance Records") or signature junk?
function isReleaseLine(line) {
  if (/[“"][^”"]+[”"]/.test(line)) return true;         // has a "quoted title"
  if (/\S\s+[-–—]\s+\S/.test(line)) return true;        // has an  Artist - Title  separator
  return false;
}

function splitArtistTitle(line) {
  // Quoted-title form:  Artist "Title"
  const q = line.match(/^(.*?)[“"](.+?)[”"]/);
  if (q && q[1].trim()) {
    return { artist: q[1].replace(/[-–—/]\s*$/, '').trim(), title: q[2].trim() };
  }
  const parts = line.split(/\s+[-–—]\s+/);
  return {
    artist: (parts[0] || '').replace(/["“”]/g, '').trim(),
    title: (parts[1] || '').replace(/["“”]/g, '').trim(),
  };
}

// Build a release from the window of lines gathered above a link.
// `window` is nearest-first: window[0] is the line closest to the link.
// This is what lets a label line ("dialogxe / Milk & Honey Records") sitting
// between the title line and the link stop hijacking the artist field.
function parseReleaseFromWindow(window, link) {
  let idx = window.findIndex(isReleaseLine);
  // Fall back to the nearest line that isn't a credit line — a line with a
  // role ("co written by …") is never the artist line.
  if (idx === -1) idx = window.findIndex(l => !detectRoles(l).length);
  if (idx === -1) idx = 0;
  const titleLine = window[idx];

  const rel = {
    raw: titleLine, link, roles: [], creditEnabled: false,
    creditNames: '', title: '', artist: '', side: 'artist',
    logo: 'mh', customRole: '', tracks: [],
  };

  const at = splitArtistTitle(titleLine);
  rel.artist = at.artist;
  rel.title = at.title;

  // Credit/role info sits on the release line or a line between it and the link.
  // Scan each (nearest first) and take the first with a role, reading its "by …".
  for (let k = 0; k <= idx; k++) {
    const roles = detectRoles(window[k]);
    if (roles.length) {
      rel.creditEnabled = true;
      rel.side = 'credit';
      rel.roles = roles;
      const by = window[k].match(/\bby\b\s+(.+?)(?:\s+on\b.*)?$/i);
      if (by) rel.creditNames = by[1].replace(/[.,;]+$/, '').trim();
      break;
    }
  }

  // The "Milk & Honey Records" cue can be on a separate label line — scan the block.
  if (looksLikeMHRecords(window.join(' '))) rel.logo = 'mhr';
  return rel;
}

function parseThread(text) {
  const lines = text.split(/\r?\n/);
  const releases = [];
  for (let i = 0; i < lines.length; i++) {
    const lm = lines[i].match(/https?:\/\/open\.spotify\.com\/\S+/);
    if (!lm) continue;
    const link = lm[0];

    // Gather up to 5 non-empty lines just above the link (nearest first),
    // skipping any blank line(s) directly above, then stopping at the next blank.
    const window = [];
    const sameLine = lines[i].slice(0, lm.index).trim();
    if (sameLine) window.push(sameLine);
    for (let j = i - 1; j >= 0 && window.length < 5; j--) {
      const t = lines[j].trim();
      if (t) window.push(t);
      else if (window.length) break;
    }
    if (window.length) releases.push(parseReleaseFromWindow(window, link));
  }
  return releases;
}

/* ---------------- Batch mode: render every release ---------------- */

function oembed(link) {
  return fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(link))
    .then(r => { if (!r.ok) throw new Error('oEmbed ' + r.status); return r.json(); });
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// Load a stored batch item's data into the global render state
function loadStateFromItem(item) {
  const r = item.rel;
  state.title = r.title || '';
  state.artist = r.artist || '';
  state.creditEnabled = r.creditEnabled;
  state.roles = (r.roles || []).slice();
  state.customRole = r.customRole || '';
  state.tracks = (r.tracks || []).slice();
  state.creditNames = r.creditNames || '';
  state.logo = r.logo || 'mh';
  state.artwork = item.img || null;
  state.accent = item.accent || '#c0392b';
  state.swatches = item.swatches ? item.swatches.slice() : [];
}

function releaseFileName(rel) {
  return `${rel.artist} - ${rel.title}`
    .replace(/[^\w\s&.'-]/g, '').replace(/\s+/g, ' ').trim() || 'release';
}

let batchItems = [];

// Clean up the pasted email first (api/release-parse: Spotify names every
// link, the AI sorts lines into releases and credits) and show the result in
// the box so it can be checked or fixed before the graphics build.
async function cleanUpThread(status) {
  const raw = $('threadInput').value.trim();
  if (!raw) return;
  status.textContent = 'Cleaning up the email…';
  try {
    const res = await fetch('/api/release-parse', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: raw, clients: state.clients || [] }) });
    const d = await res.json();
    if (!res.ok || !d.text) throw new Error(d.error || 'Clean-up failed');
    $('threadInput').value = d.text;
    if (d.notes && d.notes.length) window.alert(d.notes.join('\n'));
  } catch (e) {
    status.textContent = `Couldn’t clean up (${e.message}) — using the text as pasted.`;
  }
}

async function runBatch() {
  const status = $('batchStatus');
  await cleanUpThread(status);
  const releases = parseThread($('threadInput').value);
  if (!releases.length) {
    status.textContent = 'No Spotify links found in that text.';
    return;
  }
  $('gallery').innerHTML = '';
  batchItems = [];
  let skipped = 0;

  for (let i = 0; i < releases.length; i++) {
    const rel = releases[i];
    status.textContent = `Building ${i + 1} of ${releases.length}…`;
    const item = { rel, img: null, accent: '#c0392b', swatches: [] };
    try {
      const data = await oembed(rel.link);
      if (data.title) rel.title = data.title;
      const artUrl = (data.thumbnail_url || '').replace('ab67616d00001e02', 'ab67616d0000b273');
      const img = await loadImage(artUrl);
      item.img = img;
      state.artwork = img;
      extractSwatches(img);           // sets state.accent + state.swatches
      item.accent = state.accent;
      item.swatches = state.swatches.slice();
    } catch (e) {
      console.warn('No artwork for', rel.link, e);
      rel.warning = 'No artwork — check the link';
      skipped++;
    }
    loadStateFromItem(item);
    await render();
    item.blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    item.path = `${rel.side}/${releaseFileName(rel)}.png`;
    batchItems.push(item);
    addCard(item, canvas.toDataURL('image/png'));
  }

  status.textContent = `${releases.length} built${skipped ? ` · ${skipped} need a look` : ''}. Click any to edit, then download.`;
  $('downloadZipBtn').classList.remove('hidden');
}

function fillMeta(item) {
  const rel = item.rel;
  // Everything else (artist, title, credit) is already on the graphic —
  // the card only needs the actions, plus a flag when artwork is missing.
  item.metaEl.innerHTML =
    (rel.warning ? `<div class="warn">⚠ ${escapeHtml(rel.warning)}</div>` : '') +
    `<div class="card-actions"><button class="link-btn edit">Edit</button><button class="link-btn dl">Download</button></div>`;
  item.metaEl.querySelector('.edit').onclick = () => openEditor(item);
  item.metaEl.querySelector('.dl').onclick = () => downloadOne(item);
}

function addCard(item, dataUrl) {
  const card = document.createElement('div');
  card.className = 'card';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.title = 'Click to edit';
  img.onclick = () => openEditor(item);
  const meta = document.createElement('div');
  meta.className = 'meta';
  card.appendChild(img);
  card.appendChild(meta);
  $('gallery').appendChild(card);
  item.card = card; item.imgEl = img; item.metaEl = meta;
  fillMeta(item);
}

function updateCard(item, dataUrl) {
  item.imgEl.src = dataUrl;
  fillMeta(item);
}

function downloadOne(item) {
  const a = document.createElement('a');
  a.href = item.imgEl.src;
  a.download = `${releaseFileName(item.rel)}.png`;
  a.click();
}

// Credit label for a specific release, independent of the live editor state
function buildCreditLabelFor(rel) {
  const saved = { roles: state.roles, customRole: state.customRole, tracks: state.tracks };
  state.roles = rel.roles || []; state.customRole = rel.customRole || ''; state.tracks = rel.tracks || [];
  const label = buildCreditLabel();
  Object.assign(state, saved);
  return label;
}

/* ---------------- Batch mode: edit a card in place ---------------- */

let editingItem = null;

function openEditor(item) {
  editingItem = item;
  setMode('single');
  loadReleaseIntoForm(item);
  $('editBar').classList.remove('hidden');
  $('editActions').classList.remove('hidden');
  $('downloadBtn').classList.add('hidden');
  $('editBarLabel').textContent = `Editing: ${item.rel.artist || 'Untitled'}${item.rel.title ? ' — ' + item.rel.title : ''}`;
  document.querySelector('.panel').scrollTop = 0;
}

function deleteEdit() {
  const item = editingItem;
  if (!item) return;
  const idx = batchItems.indexOf(item);
  if (idx !== -1) batchItems.splice(idx, 1);
  if (item.card) item.card.remove();
  editingItem = null;
  setMode('batch');
  const n = batchItems.length;
  $('batchStatus').textContent = n
    ? `${n} ready. Click any to edit, then download.`
    : 'All removed — paste a thread and generate again.';
  $('downloadZipBtn').classList.toggle('hidden', n === 0);
}

// Push a batch item's data into the single-mode form + state, then render
function loadReleaseIntoForm(item) {
  const r = item.rel;
  loadStateFromItem(item);

  $('spotifyUrl').value = r.link || '';
  $('fetchStatus').textContent = '';
  $('titleInput').value = r.title || '';
  $('artistInput').value = r.artist || '';

  $('creditToggle').checked = r.creditEnabled;
  $('creditFields').classList.toggle('hidden', !r.creditEnabled);

  const hasCustom = !!(r.customRole && r.customRole.trim());
  document.querySelectorAll('#roleChips .chip').forEach(c => {
    const active = c.textContent === 'custom' ? hasCustom : (r.roles || []).includes(c.textContent);
    c.classList.toggle('active', active);
  });
  $('customRoleWrap').classList.toggle('hidden', !hasCustom);
  $('customRole').value = r.customRole || '';

  $('trackList').innerHTML = '';
  (r.tracks || []).forEach(t => addTrackRow(t));

  $('creditNames').value = r.creditNames || '';

  document.querySelectorAll('#logoType .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === (r.logo || 'mh')));

  $('accentPicker').value = state.accent;
  renderSwatches();
  updateCreditPreview();
  render();
}

function saveEdit() {
  const item = editingItem;
  if (!item) return;
  const r = item.rel;
  r.title = state.title;
  r.artist = state.artist;
  r.creditEnabled = state.creditEnabled;
  r.roles = state.roles.slice();
  r.customRole = state.customRole;
  r.tracks = state.tracks.slice();
  r.creditNames = state.creditNames;
  r.logo = state.logo;
  r.side = state.creditEnabled ? 'credit' : 'artist';
  if (state.artwork) delete r.warning; else r.warning = 'No artwork — check the link';
  item.img = state.artwork;
  item.accent = state.accent;
  item.swatches = state.swatches.slice();

  render().then(async () => {
    item.blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    item.path = `${r.side}/${releaseFileName(r)}.png`;
    updateCard(item, canvas.toDataURL('image/png'));
    editingItem = null;
    $('editBar').classList.add('hidden');
    setMode('batch');
  });
}

function cancelEdit() {
  editingItem = null;
  $('editBar').classList.add('hidden');
  setMode('batch');
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------------- Batch mode: dependency-free ZIP (store, no compression) ---------------- */

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

async function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const name = enc.encode(f.path);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const ld = new DataView(local.buffer);
    ld.setUint32(0, 0x04034b50, true);
    ld.setUint16(4, 20, true);
    ld.setUint32(14, crc, true);
    ld.setUint32(18, data.length, true);
    ld.setUint32(22, data.length, true);
    ld.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, data);

    const cen = new Uint8Array(46 + name.length);
    const cd = new DataView(cen.buffer);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);

    offset += local.length + data.length;
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ed = new DataView(end.buffer);
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(8, files.length, true);
  ed.setUint16(10, files.length, true);
  ed.setUint32(12, cenSize, true);
  ed.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}

function todayOrNextFriday() {
  const d = new Date();
  const day = d.getDay();           // 0=Sun … 5=Fri
  const add = (5 - day + 7) % 7;    // days until Friday (0 if today is Friday)
  d.setDate(d.getDate() + add);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}.${d.getFullYear()}`;
}

// One release posted twice (e.g. two clients with different credits) yields the
// same artist-title filename; suffix later copies with the credited client.
function zipPaths(items, date) {
  const seen = new Set();
  return items.map(it => {
    let path = `${date}/${it.path}`;
    if (seen.has(path)) {
      const tag = (it.rel.creditNames || '')
        .replace(/[^\w\s&.'-]/g, '').replace(/\s+/g, ' ').trim();
      let candidate = path.replace(/\.png$/, tag ? ` (${tag}).png` : ' 2.png');
      let n = 2;
      while (seen.has(candidate)) candidate = path.replace(/\.png$/, ` ${++n}.png`);
      path = candidate;
    }
    seen.add(path);
    return { path, blob: it.blob };
  });
}

async function downloadZip() {
  if (!batchItems.length) return;
  const date = ($('batchDate').value.trim() || todayOrNextFriday());
  const files = zipPaths(batchItems, date);
  const zip = await makeZip(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zip);
  a.download = `releases ${date}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function setMode(mode) {
  const batch = mode === 'batch';
  $('batchControls').classList.toggle('hidden', !batch);
  $('singleControls').classList.toggle('hidden', batch);
  $('gallery').classList.toggle('hidden', !batch);
  canvas.classList.toggle('hidden', batch);
  // Reset edit UI to the normal single-mode layout
  $('editBar').classList.add('hidden');
  $('editActions').classList.add('hidden');
  $('downloadBtn').classList.remove('hidden');
  if (batch) editingItem = null;
  document.querySelectorAll('#modeSwitch .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === mode));
}

/* ---------------- UI wiring ---------------- */

function updateCreditPreview() {
  const label = buildCreditLabel();
  $('creditPreview').textContent = label ? `Will read: “${label}”` : '';
}

function syncTracks() {
  state.tracks = [...document.querySelectorAll('#trackList .track-row input')].map(i => i.value);
  updateCreditPreview();
  render();
}

function addTrackRow(value = '') {
  const row = document.createElement('div');
  row.className = 'track-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Track title';
  input.value = value;
  input.addEventListener('input', syncTracks);
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'rm';
  rm.textContent = '×';
  rm.title = 'Remove track';
  rm.onclick = () => { row.remove(); syncTracks(); };
  row.appendChild(input);
  row.appendChild(rm);
  $('trackList').appendChild(row);
  input.focus();
}

function buildRoleChips() {
  const wrap = $('roleChips');
  ROLES.forEach(role => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = role;
    b.onclick = () => {
      b.classList.toggle('active');
      if (role === 'custom') {
        $('customRoleWrap').classList.toggle('hidden', !b.classList.contains('active'));
        if (!b.classList.contains('active')) { state.customRole = ''; $('customRole').value = ''; }
      } else {
        if (b.classList.contains('active')) state.roles.push(role);
        else state.roles = state.roles.filter(r => r !== role);
      }
      updateCreditPreview();
      render();
    };
    wrap.appendChild(b);
  });
}

function init() {
  buildRoleChips();

  $('fetchBtn').onclick = fetchSpotify;
  $('spotifyUrl').addEventListener('keydown', e => { if (e.key === 'Enter') fetchSpotify(); });

  $('artUpload').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadArtwork(url).then(() => { $('fetchStatus').textContent = 'Artwork loaded from file ✓'; });
  });

  $('titleInput').addEventListener('input', e => { state.title = e.target.value; render(); });
  $('artistInput').addEventListener('input', e => { state.artist = e.target.value; render(); });
  $('creditNames').addEventListener('input', e => { state.creditNames = e.target.value; render(); });
  $('customRole').addEventListener('input', e => { state.customRole = e.target.value; updateCreditPreview(); render(); });

  $('creditToggle').addEventListener('change', e => {
    state.creditEnabled = e.target.checked;
    $('creditFields').classList.toggle('hidden', !e.target.checked);
    render();
  });

  document.querySelectorAll('#logoType .seg-btn').forEach(b =>
    b.onclick = () => {
      state.logo = b.dataset.value;
      document.querySelectorAll('#logoType .seg-btn').forEach(x =>
        x.classList.toggle('active', x === b));
      render();
    });

  $('accentPicker').addEventListener('input', e => {
    state.accent = e.target.value;
    renderSwatches();
    render();
  });

  $('addTrackBtn').onclick = () => addTrackRow();

  $('downloadBtn').onclick = download;
  $('loadRosterBtn').onclick = loadRoster;

  // Batch mode
  document.querySelectorAll('#modeSwitch .seg-btn').forEach(b =>
    b.onclick = () => setMode(b.dataset.value));
  $('generateBtn').onclick = runBatch;
  $('downloadZipBtn').onclick = downloadZip;
  $('batchDate').value = todayOrNextFriday();
  $('saveEditBtn').onclick = saveEdit;
  $('cancelEditBtn').onclick = cancelEdit;
  $('saveEditBtn2').onclick = saveEdit;
  $('deleteEditBtn').onclick = deleteEdit;
  $('cancelEditBtn2').onclick = cancelEdit;

  // Restore saved roster
  const savedUrl = localStorage.getItem('mh_sheet_url');
  const savedRoster = localStorage.getItem('mh_roster');
  if (savedUrl) $('sheetUrl').value = savedUrl;
  if (savedRoster) {
    try {
      state.roster = JSON.parse(savedRoster);
      $('rosterStatus').textContent = `${state.roster.length} clients (cached)`;
      renderRosterList();
    } catch (e) { /* ignore */ }
  }

  logos.mh.onload = render;
  logos.mhr.onload = render;
  render();
  loadDashboardRoster();
}

init();
