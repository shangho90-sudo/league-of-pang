import { buildGrid, N, sd, walk, brush, rd } from '../src/map/grid.js';
import { TURRETS, JUNGLE, PITS, BASES } from '../src/map/layout.js';
import sharp from 'sharp';
const t=Date.now(); buildGrid(); console.log('grid ms', Date.now()-t, 'N', N);
const img=Buffer.alloc(N*N*3);
let w=0;
for(let k=0;k<N*N;k++){ let c=[30,60,30]; if(walk[k]){w++; c=rd[k]<4.4?[60,110,160]:[170,140,90];} if(brush[k]) c=[40,120,60]; img.set(c,k*3);}
const mark=(p,c)=>{const i=Math.floor((p.x+68)/0.5),j=Math.floor((p.z+68)/0.5); for(let dj=-2;dj<=2;dj++)for(let di=-2;di<=2;di++){const k=(j+dj)*N+i+di; if(k>=0&&k<N*N) img.set(c,k*3);} };
TURRETS.forEach(t=>mark(t.p,t.team?[255,60,60]:[60,120,255])); JUNGLE.camps.forEach(c=>mark(c.p,[255,255,0])); PITS.forEach(p=>mark(p.p,[255,0,255])); BASES.forEach(b=>mark(b.nexus,[255,255,255]));
console.log('walk%', (w/N/N*100).toFixed(1));
await sharp(img,{raw:{width:N,height:N,channels:3}}).resize(544,544,{kernel:'nearest'}).png().toFile('dev/map.png');
