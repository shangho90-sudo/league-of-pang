// 판정 도형 — 화면 텔레그래프와 실제 피해 판정이 같은 데이터를 사용한다.
// circle {kind:'circle', x,z, r}
// ring   {kind:'ring', x,z, r, inner}
// rect   {kind:'rect', x,z (시작점), dx,dz (단위 방향), len, w}
// cone   {kind:'cone', x,z, dx,dz, r, angle(도)}
export function hitShape(s, px, pz, pr = 0) {
  switch (s.kind) {
    case 'circle': return Math.hypot(px - s.x, pz - s.z) <= s.r + pr;
    case 'ring': { const d = Math.hypot(px - s.x, pz - s.z); return d <= s.r + pr && d >= s.inner - pr; }
    case 'rect': {
      const rx = px - s.x, rz = pz - s.z;
      const along = rx * s.dx + rz * s.dz;
      const side = -rx * s.dz + rz * s.dx;
      return along >= -pr && along <= s.len + pr && Math.abs(side) <= s.w / 2 + pr;
    }
    case 'cone': {
      const rx = px - s.x, rz = pz - s.z;
      const d = Math.hypot(rx, rz);
      if (d > s.r + pr) return false;
      if (d < pr + 0.3) return true;
      const cos = (rx * s.dx + rz * s.dz) / d;
      const half = (s.angle / 2) * (Math.PI / 180);
      // 반지름 보정 포함 각도 판정
      const extra = Math.asin(Math.min(1, pr / d));
      return Math.acos(Math.max(-1, Math.min(1, cos))) <= half + extra;
    }
  }
  return false;
}
export const circle = (x, z, r) => ({ kind: 'circle', x, z, r });
export const rect = (x, z, dx, dz, len, w) => ({ kind: 'rect', x, z, dx, dz, len, w });
export const cone = (x, z, dx, dz, r, angle) => ({ kind: 'cone', x, z, dx, dz, r, angle });
export const ring = (x, z, r, inner) => ({ kind: 'ring', x, z, r, inner });
