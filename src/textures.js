// Procedural canvas textures: asphalt with Kenyan road markings, ground
// detail, signs, shop fronts, liveries.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { LANE_W, SHOULDER } from './route.js';

let maxAniso = 8;
export function setMaxAnisotropy(a) {
  maxAniso = a;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function speckle(ctx, w, h, n, rnd, colors, size = 1.5) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = rnd() * size + 0.5;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

const roadCache = new Map();
/**
 * Texture for one carriageway. u: 0 = inner edge (centre line / median side),
 * 1 = outer edge of the paved shoulder. v repeats every 16 m.
 */
export function carriagewayTexture(lanes, dual) {
  const key = `${lanes}-${dual}`;
  if (roadCache.has(key)) return roadCache.get(key);
  const widthM = lanes * LANE_W + SHOULDER;
  const W = 1024, H = 1024; // H covers 16 m
  const pxPerM = W / widthM;
  const pyPerM = H / 16;
  const [c, ctx] = canvas(W, H);
  const rnd = mulberry32(lanes * 13 + (dual ? 7 : 1));
  ctx.fillStyle = '#4a4a4c';
  ctx.fillRect(0, 0, W, H);
  // aggregate
  speckle(ctx, W, H, 90000, rnd, ['#3a3a3c', '#58585a', '#2f2f31', '#636366', '#444446'], 2);
  // wheel tracks (polished darker bands) in each lane
  for (let l = 0; l < lanes; l++) {
    const cx = (l + 0.5) * LANE_W * pxPerM;
    for (const off of [-0.9, 0.9]) {
      const g = ctx.createLinearGradient(cx + off * pxPerM - 30, 0, cx + off * pxPerM + 30, 0);
      g.addColorStop(0, 'rgba(20,20,22,0)');
      g.addColorStop(0.5, 'rgba(20,20,22,0.22)');
      g.addColorStop(1, 'rgba(20,20,22,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx + off * pxPerM - 30, 0, 60, H);
    }
  }
  // patches & cracks
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(${40 + rnd() * 20},${40 + rnd() * 20},${42 + rnd() * 20},0.12)`;
    const pw = 40 + rnd() * 160, ph = 40 + rnd() * 200;
    ctx.fillRect(rnd() * (W - pw), rnd() * (H - ph), pw, ph);
  }
  ctx.strokeStyle = 'rgba(15,15,15,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    let x = rnd() * W, y = rnd() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * 30;
      y += rnd() * 25;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // shoulder: slightly lighter, worn
  const shX = lanes * LANE_W * pxPerM;
  ctx.fillStyle = 'rgba(120,105,90,0.18)';
  ctx.fillRect(shX, 0, W - shX, H);
  // outer edge: murram dust creeping onto the asphalt
  const g = ctx.createLinearGradient(W - 40, 0, W, 0);
  g.addColorStop(0, 'rgba(150,90,50,0)');
  g.addColorStop(1, 'rgba(150,90,50,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(W - 40, 0, 40, H);

  const line = (xm, wm, color, dash) => {
    ctx.fillStyle = color;
    const x = xm * pxPerM - (wm * pxPerM) / 2;
    const w = Math.max(2, wm * pxPerM);
    if (!dash) ctx.fillRect(x, 0, w, H);
    else {
      const [on, period] = dash;
      for (let y = 0; y < H; y += period * pyPerM) ctx.fillRect(x, y, w, on * pyPerM);
    }
  };
  const white = 'rgba(238,238,232,0.92)';
  const yellow = 'rgba(240,196,40,0.95)';
  // inner edge
  if (dual) line(0.35, 0.12, yellow, null);
  else line(0.0, 0.24, white, [4, 8]); // half of the centre line (other half on the other carriageway)
  // lane lines
  for (let l = 1; l < lanes; l++) line(l * LANE_W, 0.12, white, [3, 8]);
  // outer edge line (yellow, Kenya-style)
  line(lanes * LANE_W + 0.05, 0.15, yellow, null);
  // road studs (cat's eyes) on edge line
  for (let y = 0; y < H; y += 8 * pyPerM) {
    ctx.fillStyle = '#ffeeaa';
    ctx.fillRect((lanes * LANE_W + 0.05) * pxPerM - 3, y, 6, 6);
  }
  const t = tex(c);
  t.userData = { widthM, lengthM: 16 };
  roadCache.set(key, t);
  return t;
}

let groundTex = null;
export function groundDetailTexture() {
  if (groundTex) return groundTex;
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rnd = mulberry32(42);
  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    const r = 6 + rnd() * 30;
    const x = rnd() * S, y = rnd() * S;
    const v = 150 + rnd() * 100;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) ctx.fillRect(x - r + ox, y - r + oy, 2 * r, 2 * r);
  }
  // grass blades / stones
  for (let i = 0; i < 26000; i++) {
    const v = (100 + rnd() * 155) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    const x = rnd() * S, y = rnd() * S;
    if (rnd() < 0.7) ctx.fillRect(x, y, 1, 2 + rnd() * 4);
    else ctx.fillRect(x, y, 2, 2);
  }
  groundTex = tex(c);
  return groundTex;
}

const signCache = new Map();
function cachedSign(key, w, h, draw) {
  if (signCache.has(key)) return signCache.get(key);
  const [c, ctx] = canvas(w, h);
  draw(ctx, w, h);
  const t = tex(c, { repeat: false });
  signCache.set(key, t);
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Green KeNHA-style direction sign. rows: [{name, km}] */
export function directionSignTexture(title, rows) {
  const key = 'dir:' + title + rows.map((r) => r.name + r.km).join('|');
  return cachedSign(key, 512, 128 + rows.length * 72, (ctx, w, h) => {
    ctx.fillStyle = '#0b6a3a';
    roundRect(ctx, 0, 0, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    roundRect(ctx, 8, 8, w - 16, h - 16, 12);
    ctx.stroke();
    // route shield
    ctx.fillStyle = '#c8102e';
    roundRect(ctx, 26, 24, 110, 64, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 81, 58);
    ctx.textAlign = 'left';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText('KeNHA', 156, 58);
    rows.forEach((r, i) => {
      const y = 140 + i * 72;
      ctx.font = 'bold 46px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(r.name.toUpperCase(), 30, y);
      ctx.textAlign = 'right';
      ctx.fillText(r.km, w - 30, y);
    });
  });
}

export function speedSignTexture(limit) {
  return cachedSign('spd:' + limit, 256, 256, (ctx, w) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d0021b';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w / 2 - 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 110px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(limit), w / 2, w / 2 + 6);
  });
}

export function warningSignTexture(kind) {
  return cachedSign('warn:' + kind, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#d0021b';
    ctx.lineWidth = 22;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(w / 2, 18);
    ctx.lineTo(w - 14, h - 24);
    ctx.lineTo(14, h - 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (kind === 'wildlife') {
      // stylised elephant silhouette
      ctx.beginPath();
      ctx.ellipse(130, 150, 46, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(84, 136, 22, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(64, 140, 10, 46);
      for (const x of [98, 118, 146, 162]) ctx.fillRect(x, 160, 12, 34);
    } else if (kind === 'bump') {
      ctx.beginPath();
      ctx.ellipse(90, 180, 26, 18, 0, Math.PI, 0);
      ctx.ellipse(166, 180, 26, 18, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(50, 178, 156, 8);
    } else if (kind === 'curve') {
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(110, 200);
      ctx.quadraticCurveTo(110, 110, 160, 100);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(150, 80);
      ctx.lineTo(180, 100);
      ctx.lineTo(150, 122);
      ctx.fill();
    } else {
      ctx.font = 'bold 110px Arial';
      ctx.fillText('!', w / 2, 160);
    }
  });
}

export function boardTexture(lines, bg = '#1f4e9c', fg = '#fff', w = 512, h = 256) {
  const key = 'board:' + bg + lines.join('|');
  return cachedSign(key, w, h, (ctx) => {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    roundRect(ctx, 8, 8, w - 16, h - 16, 10);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((l, i) => {
      const size = i === 0 && n > 1 ? 34 : 46;
      ctx.font = `bold ${size}px Arial, sans-serif`;
      let text = l;
      while (ctx.measureText(text).width > w - 40 && text.length > 3) text = text.slice(0, -1);
      ctx.fillText(text, w / 2, (h / (n + 1)) * (i + 1));
    });
  });
}

export function kmPostTexture(km, code) {
  return cachedSign(`km:${code}:${km}`, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 0, w, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, w / 2, 32);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 56px Arial';
    ctx.fillText(String(km), w / 2, 120);
    ctx.font = 'bold 30px Arial';
    ctx.fillText('KM', w / 2, 178);
  });
}

export function kenyaFlagTexture() {
  return cachedSign('flag:ke', 300, 200, (ctx, w, h) => {
    const band = h / 3;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#bb0000';
    ctx.fillRect(0, band, w, band);
    ctx.fillStyle = '#006600';
    ctx.fillRect(0, band * 2, w, band);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, band - 8, w, 12);
    ctx.fillRect(0, band * 2 - 4, w, 12);
    // Maasai shield and spears
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 40, 25);
    ctx.lineTo(w / 2 + 40, h - 25);
    ctx.moveTo(w / 2 + 40, 25);
    ctx.lineTo(w / 2 - 40, h - 25);
    ctx.stroke();
    ctx.fillStyle = '#bb0000';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 30, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(w / 2 - 22, h / 2, 10, 50, 0, 0, Math.PI * 2);
    ctx.ellipse(w / 2 + 22, h / 2, 10, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 5, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 9, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// --- Building facade atlas ------------------------------------------------
let facadeTex = null;
let facadeLit = null;
const windowRects = [];
/** Night-time emissive atlas matching facadeTexture(): some windows lit. */
export function facadeLitTexture() {
  if (facadeLit) return facadeLit;
  facadeTexture();
  const [c, ctx] = canvas(1024, 1024);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 1024);
  const rnd = mulberry32(77);
  for (const [x, y, w, h] of windowRects) {
    if (rnd() < 0.45) continue;
    const warm = rnd();
    ctx.fillStyle = warm < 0.7 ? '#ffcf7a' : warm < 0.9 ? '#fff1d0' : '#a8d8ff';
    ctx.globalAlpha = 0.55 + rnd() * 0.45;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
  facadeLit = tex(c);
  facadeLit.wrapS = facadeLit.wrapT = THREE.ClampToEdgeWrapping;
  return facadeLit;
}
/** 4x4 atlas of facade cells: windows, shop fronts. Cell (0,0) is a plain wall. */
export function facadeTexture() {
  if (facadeTex) return facadeTex;
  const S = 1024, C = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = mulberry32(7);
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x0 = gx * C, y0 = gy * C;
      ctx.fillStyle = '#e8e4dc';
      ctx.fillRect(x0, y0, C, C);
      if (gx === 0 && gy === 0) continue; // plain wall / roof
      if (gy < 2) {
        // office/residential windows (one storey per cell, 3m)
        const cols = gy === 0 ? 2 : 3;
        for (let k = 0; k < cols; k++) {
          const ww = C / cols;
          const glass = gx % 2 ? '#3d5a73' : '#29323b';
          ctx.fillStyle = '#9b9690';
          ctx.fillRect(x0 + k * ww + 14, y0 + 50, ww - 28, 140);
          ctx.fillStyle = glass;
          ctx.fillRect(x0 + k * ww + 20, y0 + 56, ww - 40, 128);
          windowRects.push([x0 + k * ww + 20, y0 + 56, ww - 40, 128]);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(x0 + k * ww + 20, y0 + 56, (ww - 40) / 2, 128);
          if (gx === 3) {
            // balcony grille
            ctx.fillStyle = '#333';
            for (let b = 0; b < 8; b++) ctx.fillRect(x0 + k * ww + 20 + b * ((ww - 40) / 8), y0 + 150, 3, 36);
            ctx.fillRect(x0 + k * ww + 16, y0 + 150, ww - 32, 4);
          }
        }
      } else {
        // ground-floor shop fronts with steel doors
        ctx.fillStyle = '#58534d';
        ctx.fillRect(x0 + 20, y0 + 70, C - 40, C - 70);
        ctx.fillStyle = gx % 2 ? '#7a8288' : '#6b4b2f';
        for (let k = 0; k < 2; k++) {
          ctx.fillRect(x0 + 30 + k * (C / 2 - 20), y0 + 80, C / 2 - 40, C - 80);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          for (let r = 0; r < 14; r++) ctx.fillRect(x0 + 30 + k * (C / 2 - 20), y0 + 84 + r * 12, C / 2 - 40, 3);
          ctx.fillStyle = gx % 2 ? '#7a8288' : '#6b4b2f';
        }
        if (gy === 3) {
          // goods on display
          for (let k = 0; k < 10; k++) {
            ctx.fillStyle = `hsl(${rnd() * 360},70%,50%)`;
            ctx.fillRect(x0 + 24 + rnd() * (C - 60), y0 + 190 + rnd() * 40, 14, 18);
          }
        }
      }
    }
  }
  facadeTex = tex(c);
  facadeTex.wrapS = facadeTex.wrapT = THREE.ClampToEdgeWrapping;
  return facadeTex;
}

const SHOP_NAMES = [
  'HOTELI NA LODGING', 'NYAMA CHOMA', 'AGROVET', 'BUTCHERY', 'WHOLESALE', 'CHEMIST', 'BARBER SHOP',
  'MAMA MBOGA', 'HARDWARE', 'MPESA AGENT', 'CAFE & RESTAURANT', 'TYRE CENTRE', 'BOOKSHOP', 'SALOON',
  'GENERAL SHOP', 'PHONE REPAIRS',
];
const SHOP_COLORS = ['#e2231a', '#00843d', '#ffd200', '#0067b1', '#f47920', '#7b2d8e', '#00a3e0', '#c4161c'];
let shopTex = null;
/** 4x4 atlas of painted shop signboards. */
export function shopSignTexture() {
  if (shopTex) return shopTex;
  const S = 1024, CW = 256, CH = 64;
  const [c, ctx] = canvas(S, CH * 16);
  for (let i = 0; i < 16; i++) {
    const y = i * CH;
    for (let k = 0; k < 4; k++) {
      const x = k * CW;
      const bg = SHOP_COLORS[(i + k * 3) % SHOP_COLORS.length];
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, CW, CH);
      ctx.fillStyle = bg === '#ffd200' ? '#111' : '#fff';
      ctx.font = 'bold 26px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SHOP_NAMES[(i * 4 + k) % SHOP_NAMES.length], x + CW / 2, y + CH / 2 + 2);
    }
  }
  shopTex = tex(c, { repeat: false });
  return shopTex;
}

const MATATU_NAMES = ['NEEMA', 'BARAKA', 'SAFARI EXPRESS', 'MOTO MOTO', 'KAMANDA', 'MASHUJAA', 'NGANYA', 'SUPER METRO', 'BAHATI', 'TUSKER RIDE'];
const liveryCache = [];
/** Side livery for matatus: graffiti blocks + mandatory yellow band. */
export function matatuLivery(i) {
  i = i % 8;
  if (liveryCache[i]) return liveryCache[i];
  const [c, ctx] = canvas(512, 256);
  const rnd = mulberry32(100 + i);
  const base = ['#111', '#fff', '#1b1b6b', '#6b0f1a', '#0d3b2e', '#222', '#f2f2f2', '#2b1055'][i];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 256);
  for (let k = 0; k < 30; k++) {
    ctx.fillStyle = `hsla(${rnd() * 360},90%,${45 + rnd() * 20}%,0.85)`;
    ctx.beginPath();
    const x = rnd() * 512, y = rnd() * 256;
    ctx.moveTo(x, y);
    for (let p = 0; p < 4; p++) ctx.lineTo(x + (rnd() - 0.5) * 220, y + (rnd() - 0.5) * 140);
    ctx.fill();
  }
  ctx.font = 'italic bold 54px Impact, Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000';
  ctx.fillStyle = `hsl(${rnd() * 360},100%,60%)`;
  const name = MATATU_NAMES[i % MATATU_NAMES.length];
  ctx.strokeText(name, 256, 150);
  ctx.fillText(name, 256, 150);
  // yellow band (PSV regulation)
  ctx.fillStyle = '#ffd200';
  ctx.fillRect(0, 196, 512, 26);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('14 PASSENGERS · ROUTE ' + (100 + i * 11), 256, 215);
  liveryCache[i] = tex(c, { repeat: false });
  return liveryCache[i];
}

const coachCache = [];
export function coachLivery(i) {
  i = i % 4;
  if (coachCache[i]) return coachCache[i];
  const [c, ctx] = canvas(1024, 256);
  const cols = [['#f5f5f5', '#c8102e', '#ffd200'], ['#0a2a66', '#ffffff', '#f47920'], ['#ffffff', '#00843d', '#111'], ['#ffd200', '#111', '#c8102e']][i];
  ctx.fillStyle = cols[0];
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = cols[1];
  ctx.beginPath();
  ctx.moveTo(0, 170);
  ctx.bezierCurveTo(300, 120, 600, 230, 1024, 150);
  ctx.lineTo(1024, 256);
  ctx.lineTo(0, 256);
  ctx.fill();
  ctx.fillStyle = cols[2];
  ctx.fillRect(0, 226, 1024, 12);
  ctx.fillStyle = cols[1];
  ctx.font = 'italic bold 52px Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(['MOMBASA EXPRESS', 'NORTHERN STAR', 'LAKE COAST', 'SAVANNA LINE'][i], 512, 215 - 60);
  coachCache[i] = tex(c, { repeat: false });
  return coachCache[i];
}

const contCache = [];
export function containerTexture(i) {
  i = i % 5;
  if (contCache[i]) return contCache[i];
  const [c, ctx] = canvas(512, 128);
  const col = ['#1d5fa8', '#b5261e', '#2e7d32', '#e07b16', '#7a7a7a'][i];
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, 0, 3, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 4, 0, 2, 128);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 34px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(['EAC CARGO', 'OCEAN LINE', 'SAFARI FREIGHT', 'RIFT LOGISTICS', 'BANDARI'][i], 256, 76);
  contCache[i] = tex(c, { repeat: false });
  return contCache[i];
}

let zebraTex = null;
export function zebraTexture() {
  if (zebraTex) return zebraTex;
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#f1efe8';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#111';
  for (let x = 0; x < 256; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 14, 80, x - 10, 170, x + 8, 256);
    ctx.lineTo(x + 18, 256);
    ctx.bezierCurveTo(x, 170, x + 24, 80, x + 10, 0);
    ctx.fill();
  }
  zebraTex = tex(c);
  return zebraTex;
}

let giraffeTex = null;
export function giraffeTexture() {
  if (giraffeTex) return giraffeTex;
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#f3e2b5';
  ctx.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(9);
  for (let y = 0; y < 256; y += 36) {
    for (let x = (y / 36) % 2 ? 18 : 0; x < 256; x += 36) {
      ctx.fillStyle = '#9a5323';
      ctx.beginPath();
      const cx = x + rnd() * 6, cy = y + rnd() * 6;
      for (let a = 0; a < 6; a++) {
        const r = 13 + rnd() * 4;
        const ang = (a / 6) * Math.PI * 2;
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      }
      ctx.fill();
    }
  }
  giraffeTex = tex(c);
  return giraffeTex;
}
