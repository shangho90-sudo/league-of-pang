// 절차적 '손으로 칠한 듯한' 타일 텍스처 생성기 (외부 이미지 없이 독자 제작)
import * as THREE from 'three';

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 주기적(타일링) 값 노이즈
function makePNoise(seed) {
  const rnd = mulberry(seed);
  const perm = new Float32Array(256 * 256);
  for (let i = 0; i < perm.length; i++) perm[i] = rnd();
  return function (x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = (a) => ((a % period) + period) % period;
    const g = (i, j) => perm[(m(j) & 255) * 256 + (m(i) & 255)];
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbmP(noise, x, y, basePeriod, oct = 4) {
  let s = 0, amp = 0.5, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    s += noise(x * f, y * f, basePeriod * f) * amp;
    tot += amp; amp *= 0.5; f *= 2;
  }
  return s / tot;
}
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

function canvasTex(size, painter, { srgb = true, repeat = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// 픽셀 단위 노이즈 바탕 + 붓질 레이어
function paintBase(ctx, S, seed, palette, opts = {}) {
  const n = makePNoise(seed);
  const img = ctx.createImageData(S, S);
  const P = opts.period || 6;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * P, v = (y / S) * P;
      const big = fbmP(n, u, v, P, 4);
      const fine = n(u * 6, v * 6, P * 6);
      // 방향성 붓 자국 (늘어난 노이즈)
      const stroke = n(u * 2.0 + v * 0.6, v * 7.0, P * 7);
      let t = big * 0.75 + stroke * 0.25;
      t = Math.max(0, Math.min(1, (t - 0.25) * 1.9));
      let c;
      if (t < 0.5) c = mix3(palette[0], palette[1], t * 2);
      else c = mix3(palette[1], palette[2], (t - 0.5) * 2);
      const k = 1 + (fine - 0.5) * (opts.grain ?? 0.12);
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, c[0] * k);
      img.data[i + 1] = Math.min(255, c[1] * k);
      img.data[i + 2] = Math.min(255, c[2] * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
// 타일 경계를 넘어 감싸는 붓 터치
function wrapStroke(ctx, S, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore(); }
}

export function makeGroundTextures() {
  const S = 512;
  const rnd = mulberry(7);
  const grass = canvasTex(S, (ctx) => {
    paintBase(ctx, S, 11, [hex(0x2f5a2a), hex(0x4a7a34), hex(0x6f9a45)], { period: 5, grain: 0.1 });
    // 풀잎 붓 터치
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * S, y = rnd() * S, l = 6 + rnd() * 10, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const light = rnd() > 0.5;
      ctx.strokeStyle = light ? `rgba(150,190,90,${0.18 + rnd() * 0.2})` : `rgba(20,50,25,${0.18 + rnd() * 0.2})`;
      ctx.lineWidth = 1.2 + rnd() * 1.6;
      ctx.lineCap = 'round';
      wrapStroke(ctx, S, () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); });
    }
    // 작은 꽃 점
    for (let i = 0; i < 40; i++) {
      const x = rnd() * S, y = rnd() * S;
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(230,220,150,0.55)' : 'rgba(190,200,240,0.45)';
      ctx.beginPath(); ctx.arc(x, y, 1.4 + rnd(), 0, 7); ctx.fill();
    }
  });
  const dirt = canvasTex(S, (ctx) => {
    paintBase(ctx, S, 23, [hex(0x6e5233), hex(0x9a7448), hex(0xc19a63)], { period: 4, grain: 0.14 });
    // 자갈
    for (let i = 0; i < 260; i++) {
      const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 4.5;
      wrapStroke(ctx, S, () => {
        ctx.fillStyle = `rgba(60,45,32,0.35)`;
        ctx.beginPath(); ctx.ellipse(x + 1, y + 1.5, r, r * 0.75, 0, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(${190 + rnd() * 30},${165 + rnd() * 25},${125 + rnd() * 20},0.75)`;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, rnd(), 0, 7); ctx.fill();
      });
    }
    // 바퀴/발자국 흔적 같은 긴 붓질
    for (let i = 0; i < 90; i++) {
      const x = rnd() * S, y = rnd() * S, l = 20 + rnd() * 40;
      ctx.strokeStyle = `rgba(80,58,36,${0.12 + rnd() * 0.12})`; ctx.lineWidth = 3 + rnd() * 5; ctx.lineCap = 'round';
      wrapStroke(ctx, S, () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + l * 0.5, y + (rnd() - 0.5) * 10, x + l, y + (rnd() - 0.5) * 8); ctx.stroke(); });
    }
  });
  const rock = canvasTex(S, (ctx) => {
    paintBase(ctx, S, 37, [hex(0x3f4b56), hex(0x617181), hex(0x8b9aa6)], { period: 3, grain: 0.18 });
    // 균열과 층리
    for (let i = 0; i < 70; i++) {
      let x = rnd() * S, y = rnd() * S;
      ctx.strokeStyle = `rgba(30,36,44,${0.35 + rnd() * 0.3})`; ctx.lineWidth = 1 + rnd() * 2;
      const pts = [[x, y]];
      for (let k = 0; k < 5; k++) { x += (rnd() - 0.3) * 30; y += (rnd() - 0.5) * 14; pts.push([x, y]); }
      wrapStroke(ctx, S, () => { ctx.beginPath(); ctx.moveTo(...pts[0]); pts.forEach((p) => ctx.lineTo(...p)); ctx.stroke(); });
    }
    for (let i = 0; i < 120; i++) {
      const x = rnd() * S, y = rnd() * S, w = 20 + rnd() * 50;
      ctx.strokeStyle = `rgba(170,185,195,${0.1 + rnd() * 0.15})`; ctx.lineWidth = 2 + rnd() * 3;
      wrapStroke(ctx, S, () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + (rnd() - 0.5) * 6); ctx.stroke(); });
    }
  });
  const sand = canvasTex(S, (ctx) => {
    paintBase(ctx, S, 41, [hex(0x6b6a55), hex(0x8f8a6a), hex(0xb2a982)], { period: 4, grain: 0.12 });
    for (let i = 0; i < 300; i++) {
      const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 6;
      ctx.fillStyle = `rgba(${90 + rnd() * 40},${100 + rnd() * 40},${110 + rnd() * 30},0.6)`;
      wrapStroke(ctx, S, () => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 7); ctx.fill(); });
    }
  });
  const forest = canvasTex(S, (ctx) => {
    paintBase(ctx, S, 53, [hex(0x1d3320), hex(0x2c4a2a), hex(0x4a5a30)], { period: 5, grain: 0.15 });
    for (let i = 0; i < 700; i++) {
      const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 4;
      const c = rnd();
      ctx.fillStyle = c < 0.4 ? `rgba(110,80,40,0.45)` : c < 0.8 ? `rgba(60,95,45,0.5)` : `rgba(150,130,60,0.4)`;
      wrapStroke(ctx, S, () => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, rnd() * 3, 0, 7); ctx.fill(); });
    }
  });
  const tiles = canvasTex(S, (ctx) => {
    paintBase(ctx, S, 61, [hex(0x5d6670), hex(0x7d8894), hex(0x9aa5ae)], { period: 4, grain: 0.15 });
    // 불규칙 판석
    const cells = 4;
    const cs = S / cells;
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const off = (j % 2) * cs * 0.5;
      const x = i * cs + off, y = j * cs;
      ctx.strokeStyle = 'rgba(35,40,48,0.75)'; ctx.lineWidth = 4;
      wrapStroke(ctx, S, () => {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + cs - 3 + (rnd() - 0.5) * 6, y + 3);
        ctx.lineTo(x + cs - 3, y + cs - 3 + (rnd() - 0.5) * 6); ctx.lineTo(x + 3, y + cs - 3); ctx.closePath(); ctx.stroke();
      });
      ctx.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.06})`;
      wrapStroke(ctx, S, () => ctx.fillRect(x + 6, y + 6, cs - 14, cs * 0.3));
    }
  });
  return { grass, dirt, rock, sand, forest, tiles };
}

// 이펙트용 텍스처들
export function makeFxTextures() {
  const soft = canvasTex(64, (ctx, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }, { repeat: false });
  const spark = canvasTex(64, (ctx, S) => {
    ctx.translate(S / 2, S / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -S / 2); ctx.lineTo(4, 0); ctx.lineTo(0, S / 2); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-S / 2, 0); ctx.lineTo(0, 3); ctx.lineTo(S / 2, 0); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
  }, { repeat: false });
  const star = canvasTex(64, (ctx, S) => {
    ctx.translate(S / 2, S / 2); ctx.fillStyle = 'white';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? S * 0.16 : S * 0.46; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.shadowColor = 'white'; ctx.shadowBlur = 6; ctx.fill();
  }, { repeat: false });
  const shard = canvasTex(64, (ctx, S) => {
    ctx.translate(S / 2, S / 2); ctx.rotate(0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.moveTo(0, -S * 0.42); ctx.lineTo(S * 0.16, S * 0.05); ctx.lineTo(0, S * 0.42); ctx.lineTo(-S * 0.12, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 2; ctx.stroke();
  }, { repeat: false });
  const drop = canvasTex(64, (ctx, S) => {
    ctx.translate(S / 2, S / 2);
    const g = ctx.createRadialGradient(-4, 4, 0, 0, 6, S * 0.35);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -S * 0.42); ctx.bezierCurveTo(S * 0.3, 0, S * 0.3, S * 0.38, 0, S * 0.38); ctx.bezierCurveTo(-S * 0.3, S * 0.38, -S * 0.3, 0, 0, -S * 0.42); ctx.fill();
  }, { repeat: false });
  const ring = canvasTex(128, (ctx, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(0.85, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }, { repeat: false });
  const smoke = canvasTex(64, (ctx, S) => {
    const n = makePNoise(5);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
      const a = Math.max(0, 1 - d) * (0.5 + fbmP(n, x / 16, y / 16, 4, 3) * 0.8);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: false });
  const note = canvasTex(64, (ctx, S) => {
    // 얇은 파동 호
    ctx.strokeStyle = 'white'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(S / 2, S * 0.9, S * 0.6, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke();
  }, { repeat: false });
  return { soft, spark, star, shard, drop, ring, smoke, note };
}

export { mulberry, makePNoise, fbmP };
